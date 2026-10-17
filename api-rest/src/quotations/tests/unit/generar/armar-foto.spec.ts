import { armarFoto } from '../../../generar/armar-foto';
import { ofrecible } from '../../../generar/reglas-valle-del-sol';
import type { CajaDelPlan, PlanDeLaIA } from '../../../generar/tipos';
import { computeMoney } from '../../../utils/money';
import { catalogoDePrueba } from './catalogo-de-prueba';

// De lo que elige la IA a la foto del cotizador (doc 16 §6). La IA solo
// pone ids: nombres y precios salen del catálogo, y lo que no calza vuelve
// como error para que corrija.

const plan = (p: Partial<PlanDeLaIA>): PlanDeLaIA => ({
  cajas: [],
  fijos: [],
  ultimo_dia: '',
  descuento_porcentaje: 0,
  presupuesto_cliente: { monto: 0, por: 'persona' },
  nota: 'ok',
  ...p,
});

const caja = (c: Partial<CajaDelPlan>): CajaDelPlan => ({
  dia: 1,
  categoria: 'Cena',
  audiencia: 'adultos',
  personas: 41,
  menu_id: 0,
  servicios: [],
  ...c,
});

const evento = {
  fecha: '2026-12-20',
  personas: 41,
  ninos: 0,
  esTourOperador: false,
};

describe('armar la foto: la receta de faena (Rudel y Ecofor)', () => {
  it('cena Nivel 1 + alojamiento de alta + desayuno del día siguiente = $47.600 por persona, al peso', () => {
    const r = armarFoto(
      plan({
        ultimo_dia: '2026-12-21',
        cajas: [
          caja({ dia: 1, categoria: 'Cena', menu_id: 94 }),
          caja({
            dia: 1,
            categoria: 'Servicios de Ingreso',
            servicios: [{ id: 2155, cantidad: 1 }],
          }),
          caja({ dia: 2, categoria: 'Desayuno', menu_id: 47 }),
        ],
      }),
      catalogoDePrueba(),
      evento,
      ofrecible,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dias).toBe(2);
    expect(r.ultimoDia).toBe('2026-12-21');

    // La cena trae la sección fija aunque el menú no la tenga.
    const cena = r.items.variable_services[0];
    expect(cena.items.map((i) => i.codigo)).toEqual([
      '3001',
      '3002',
      '3003',
      '2054',
      '2205',
    ]);
    expect(cena.category_id).toBe(30);

    const dinero = computeMoney({
      items: r.items,
      people_count: 41,
      children_count: 0,
      discount_percentage: 0,
      discount_amount: 0,
      tip_percentage: null,
    });
    expect(dinero.valuePerPerson).toBe(47_600);
    expect(dinero.totalAmount).toBe(41 * 47_600);
  });

  it('nombres y precios salen del catálogo, nunca de la IA', () => {
    const r = armarFoto(
      plan({
        cajas: [
          caja({
            categoria: 'Servicios de Ingreso',
            servicios: [{ id: 2244, cantidad: 1 }],
          }),
        ],
      }),
      catalogoDePrueba(),
      evento,
    );
    expect(r.ok && r.items.variable_services[0].items[0]).toEqual({
      codigo: '2244',
      nombre: 'Alojamiento temporada media',
      precio: 22000,
      categoria: 'Servicios de Ingreso',
      quantity: 1,
    });
  });
});

describe('armar la foto: lo que no calza vuelve como error', () => {
  const errores = (p: PlanDeLaIA, e = evento) => {
    const r = armarFoto(p, catalogoDePrueba(), e, ofrecible);
    return r.ok ? [] : r.errores;
  };

  it('un menú de otra categoría', () => {
    expect(
      errores(plan({ cajas: [caja({ categoria: 'Cena', menu_id: 47 })] })),
    ).toEqual([expect.stringContaining('es de «Desayuno»')]);
  });

  it('un servicio que no se ofrece en esa comida', () => {
    expect(
      errores(
        plan({
          cajas: [
            caja({ categoria: 'Cena', servicios: [{ id: 2155, cantidad: 1 }] }),
          ],
        }),
      ),
    ).toEqual([expect.stringContaining('no se ofrece en «Cena»')]);
  });

  it('una categoría que no existe, o Sernatur', () => {
    expect(errores(plan({ cajas: [caja({ categoria: 'Cenas' })] }))).toEqual([
      expect.stringContaining('no existe'),
    ]);
    expect(
      errores(
        plan({
          cajas: [
            caja({
              categoria: 'Sernatur - almuerzo',
              servicios: [{ id: 5001, cantidad: 1 }],
            }),
          ],
        }),
      ),
    ).toEqual([expect.stringContaining('no se ofrece')]);
  });

  it('un día fuera del evento', () => {
    expect(errores(plan({ cajas: [caja({ dia: 2, menu_id: 94 })] }))).toEqual([
      expect.stringContaining('de 1 a 1'),
    ]);
  });

  it('niños donde no hay, o más personas que el grupo', () => {
    expect(
      errores(
        plan({
          cajas: [
            caja({
              categoria: 'Cena niños',
              audiencia: 'ninos',
              personas: 5,
              servicios: [{ id: 4001, cantidad: 1 }],
            }),
          ],
        }),
      ),
    ).toEqual([expect.stringContaining('no tiene niños')]);
    expect(
      errores(plan({ cajas: [caja({ personas: 50, menu_id: 94 })] })),
    ).toEqual([expect.stringContaining('de 1 a 41')]);
  });

  it('con niños, la caja de niños va con los niños y la de adultos con los adultos', () => {
    const r = armarFoto(
      plan({
        cajas: [
          caja({ personas: 35, menu_id: 94 }),
          caja({
            categoria: 'Cena niños',
            audiencia: 'ninos',
            personas: 6,
            servicios: [{ id: 4001, cantidad: 1 }],
          }),
        ],
      }),
      catalogoDePrueba(),
      { ...evento, ninos: 6 },
    );
    expect(r.ok).toBe(true);
  });

  it('un fijo que no es del catálogo y el 15% fuera de tour operadores', () => {
    expect(
      errores(
        plan({
          cajas: [caja({ menu_id: 94 })],
          fijos: [{ dia: 0, id: 999, cantidad: 1 }],
          descuento_porcentaje: 15,
        }),
      ),
    ).toEqual([
      expect.stringContaining('no es un servicio fijo'),
      expect.stringContaining('solo para tour operadores'),
    ]);
  });

  it('la cantidad es por persona: 41 platos por persona vuelve como error (prueba del lab, 17-10)', () => {
    expect(
      errores(
        plan({
          cajas: [
            caja({
              categoria: 'Cena',
              personas: 41,
              servicios: [{ id: 3001, cantidad: 41 }],
            }),
          ],
        }),
      ),
    ).toEqual([expect.stringContaining('es POR PERSONA')]);
  });

  it('sin cajas no hay cotización', () => {
    expect(errores(plan({}))).toEqual([
      expect.stringContaining('ninguna caja'),
    ]);
  });
});

describe('armar la foto: orden y fijos', () => {
  it('las cajas quedan en el orden de los días; dentro del día, el de la IA', () => {
    const r = armarFoto(
      plan({
        ultimo_dia: '2026-12-21',
        cajas: [
          caja({ dia: 2, categoria: 'Desayuno', menu_id: 47 }),
          caja({ dia: 1, categoria: 'Cena', menu_id: 94 }),
          caja({
            dia: 1,
            categoria: 'Servicios de Ingreso',
            servicios: [{ id: 2155, cantidad: 1 }],
          }),
        ],
        fijos: [{ dia: 1, id: 40, cantidad: 1 }],
      }),
      catalogoDePrueba(),
      evento,
    );
    expect(r.ok && r.items.variable_services.map((c) => c.category)).toEqual([
      'Cena',
      'Servicios de Ingreso',
      'Desayuno',
    ]);
    expect(r.ok && r.items.fixed_services[0]).toMatchObject({
      codigo: '40',
      nombre: 'Salón cúpula día completo',
      precio: 400000,
      day: 1,
      tipo_calculo: 'fijo',
    });
  });

  it('ultimo_dia igual al primero es un evento de un día', () => {
    const r = armarFoto(
      plan({ ultimo_dia: '2026-12-20', cajas: [caja({ menu_id: 94 })] }),
      catalogoDePrueba(),
      evento,
    );
    expect(r.ok && r.ultimoDia).toBeNull();
  });
});
