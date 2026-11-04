import { ConflictException } from '@nestjs/common';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { verifyMoney } from 'src/quotations/utils/money';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { ErrorDeHerramienta, sumarDias } from '../herramientas/comun';
import { leerCambios } from '../herramientas/proponer';
import { editarFoto, type FotoGuardada } from '../propuestas/editar-foto';
import {
  choqueConLoServido,
  cuotasDespues,
  parcheDe,
  porQueNo,
} from '../propuestas/reglas';
import {
  armarServicio,
  camila,
  catalogo,
  cotizacion,
  evento,
  foto,
  hoy,
  persona,
} from './datos-de-prueba';

// BELIA, FASE 2 (doc 20 §12, "pruebas de lo prohibido"): BelIA propone y la
// persona aprueba. Lo que se prueba acá es que los candados vuelvan a
// cerrar al aplicar: lo realizado, los días servidos, las compras hechas y
// la cotización que alguien cambió entre medio. Y que los precios salgan
// siempre del catálogo.

describe('Los cambios de BelIA sobre los servicios', () => {
  it('cambia un postre por otro: el nuevo con el precio del catálogo, lo demás intacto', () => {
    const r = editarFoto(
      foto(),
      [
        { accion: 'quitar', dia: 1, categoria: 'Cena', ids: ['3'] },
        {
          accion: 'agregar',
          dia: 1,
          categoria: 'Cena',
          servicios: [{ id: 4, cantidad: 1 }],
        },
      ],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    const cena = r.foto.variable_services![0];
    expect(cena.items!.map((i) => [i.nombre, i.precio])).toEqual([
      ['Pan', 500],
      ['Lomo', 9_000],
      ['Leche asada', 2_500],
    ]);
    // El desayuno no se tocó.
    expect(r.foto.variable_services![1]).toEqual(foto().variable_services![1]);
    expect(r.lineas).toEqual([
      {
        dia: 1,
        que: 'Cena · 40 adultos',
        quita: ['Leche nevada'],
        agrega: ['Leche asada'],
      },
    ]);
    expect(r.diasTocados).toEqual([1]);
    // El principal ya iba sin guarnición: no es aviso de este cambio.
    expect(r.avisos).toEqual([]);
  });

  it('avisa solo la forma que trae el cambio: sacar el postre sí, lo que ya venía no', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'quitar', dia: 1, categoria: 'Cena', ids: ['3'] }],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    expect(r.avisos).toEqual(['Día 1 · Cena: no trae postre.']);
  });

  it('pone una casilla con un menú guardado: la sección fija entra sola y va en su día', () => {
    const r = editarFoto(
      foto(),
      [
        {
          accion: 'poner_casilla',
          dia: 3,
          categoria: 'Cena',
          audiencia: 'adultos',
          personas: 30,
          menu_id: 900,
          quitar: [3],
          servicios: [{ id: 4, cantidad: 1 }],
        },
      ],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    const nueva = r.foto.variable_services![2];
    expect(nueva).toMatchObject({ day: 3, people: 30, category_id: 20 });
    expect(nueva.items!.map((i) => i.codigo).sort()).toEqual(['1', '2', '4']);
    expect(r.lineas[0]).toMatchObject({ dia: 3, casilla: 'nueva' });
  });

  it('bajar personas queda marcado (con compras hechas, solo el administrador)', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 35 }],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    expect(r.bajanPersonas).toBe(true);
    expect(r.lineas[0].personas).toEqual({ antes: 40, despues: 35 });
  });

  it('una casilla que queda sin servicios sale', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'quitar', dia: 2, categoria: 'Desayuno', ids: ['5'] }],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    expect(r.foto.variable_services).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ dia: 2, casilla: 'sale' });
  });

  it('pone y saca fijos del catálogo; un fijo que no es de precio fijo no entra', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'poner_fijo', id: 70, dia: 0, cantidad: 1 }],
      catalogo(),
      evento,
    );
    if (!r.ok) throw new Error(r.errores.join(' | '));
    expect(r.foto.fixed_services).toEqual([
      expect.objectContaining({ codigo: '70', precio: 300_000, day: 0 }),
    ]);
    expect(r.diasTocados).toEqual([0]);
    const otro = editarFoto(
      foto(),
      [{ accion: 'poner_fijo', id: 71, dia: 0, cantidad: 1 }],
      catalogo(),
      evento,
    );
    expect(otro.ok).toBe(false);
  });

  it('lo que no calza no arma nada: categoría, servicio de otra comida y día fuera del evento', () => {
    const r = editarFoto(
      foto(),
      [
        {
          accion: 'agregar',
          dia: 1,
          categoria: 'Cena',
          servicios: [{ id: 5, cantidad: 1 }],
        },
        { accion: 'quitar', dia: 7, categoria: 'Cena', ids: ['2'] },
        { accion: 'quitar_casilla', dia: 1, categoria: 'Almuerzo' },
      ],
      catalogo(),
      evento,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores).toHaveLength(3);
    expect(r.errores[0]).toContain('no se ofrece en «Cena»');
    expect(r.errores[1]).toContain('el día debe ir de 1 a 3');
  });

  it('con dos casillas iguales el mismo día, pide cuál', () => {
    const doble = foto();
    doble.variable_services!.push({
      ...doble.variable_services![0],
      people: 10,
    });
    const r = editarFoto(
      doble,
      [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 12 }],
      catalogo(),
      evento,
    );
    expect(r.ok).toBe(false);
    const bien = editarFoto(
      doble,
      [
        {
          accion: 'personas',
          dia: 1,
          categoria: 'Cena',
          personas: 12,
          cual: 10,
        },
      ],
      catalogo(),
      evento,
    );
    expect(bien.ok).toBe(true);
  });

  it('dos casillas iguales del formato antiguo (sin día ni personas): se distinguen por lo que tienen', () => {
    const antigua: FotoGuardada = {
      variable_services: [
        {
          category: 'Cena',
          items: [
            { codigo: '2', nombre: 'Lomo', precio: 9_000, quantity: 1 },
            { codigo: '3', nombre: 'Leche nevada', precio: 2_000, quantity: 1 },
          ],
        },
        {
          category: 'Cena',
          items: [
            { codigo: '4', nombre: 'Leche asada', precio: 2_500, quantity: 1 },
          ],
        },
      ],
    };
    // Al sacar, la casilla es la que tiene el plato.
    const quita = editarFoto(
      antigua,
      [{ accion: 'quitar', dia: 1, categoria: 'Cena', ids: ['3'] }],
      catalogo(),
      evento,
    );
    if (!quita.ok) throw new Error(quita.errores.join(' | '));
    expect(quita.foto.variable_services![0].items).toHaveLength(1);
    // Al agregar, se dice con «que_tiene».
    const sinPista = editarFoto(
      antigua,
      [
        {
          accion: 'agregar',
          dia: 1,
          categoria: 'Cena',
          servicios: [{ id: 3, cantidad: 1 }],
        },
      ],
      catalogo(),
      evento,
    );
    expect(sinPista.ok).toBe(false);
    const conPista = editarFoto(
      antigua,
      [
        {
          accion: 'agregar',
          dia: 1,
          categoria: 'Cena',
          que_tiene: '4',
          servicios: [{ id: 3, cantidad: 1 }],
        },
      ],
      catalogo(),
      evento,
    );
    if (!conPista.ok) throw new Error(conPista.errores.join(' | '));
    expect(conPista.foto.variable_services![1].items).toHaveLength(2);
    // Lo que no se tocó sigue sin día ni personas: la plata no cambia sola.
    expect(conPista.foto.variable_services![0]).toEqual(
      antigua.variable_services![0],
    );
    expect(conPista.foto.variable_services![1].day).toBeUndefined();
  });

  it('si no cambia nada, no hay propuesta', () => {
    const r = editarFoto(
      foto(),
      [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 40 }],
      catalogo(),
      evento,
    );
    expect(r.ok).toBe(false);
  });

  it('la IA no puede mandar acciones que no existen', () => {
    expect(() => leerCambios([{ accion: 'anular' }])).toThrow(
      ErrorDeHerramienta,
    );
  });
});

describe('Las reglas de los cambios', () => {
  it('lo realizado está congelado para todos, también el administrador', () => {
    expect(
      porQueNo(
        cotizacion({ quotation_status: QuotationStatus.REALIZADA }),
        persona(UserRole.ADMINISTRADOR),
      ),
    ).toContain('congelada');
  });

  it('una aceptada la cambian solo administración y operaciones', () => {
    const vendida = cotizacion({ quotation_status: QuotationStatus.ACEPTADA });
    expect(porQueNo(vendida, persona(UserRole.VENDEDOR))).toContain(
      'administración y operaciones',
    );
    expect(porQueNo(vendida, persona(UserRole.OPERACIONES))).toBeNull();
  });

  it('un requerimiento, una rechazada o una anulada no se cambian', () => {
    const v = persona(UserRole.VENDEDOR);
    expect(
      porQueNo(cotizacion({ request_type: RequestType.REQUERIMIENTO }), v),
    ).toContain('requerimiento');
    expect(
      porQueNo(cotizacion({ quotation_status: QuotationStatus.RECHAZADA }), v),
    ).toContain('rechazada');
    expect(
      porQueNo(cotizacion({ quotation_status: QuotationStatus.CANCELADA }), v),
    ).toContain('anulada');
  });

  it('en un evento que empezó, los días servidos y el de hoy no se tocan', () => {
    const enCurso = cotizacion({ quotation_status: QuotationStatus.ACEPTADA });
    // Hoy es el día 2 de 3.
    expect(choqueConLoServido(enCurso, [3], '2026-11-10')).toBeNull();
    expect(choqueConLoServido(enCurso, [2], '2026-11-10')).toContain(
      'días 1 a 2',
    );
    expect(choqueConLoServido(enCurso, [0], '2026-11-10')).toContain(
      'todo el evento',
    );
    expect(choqueConLoServido(enCurso, [3], '2026-11-11')).toContain(
      'último día',
    );
    // Antes de que empiece, y en lo no vendido, no hay días cerrados.
    expect(choqueConLoServido(enCurso, [1], '2026-11-08')).toBeNull();
    expect(choqueConLoServido(cotizacion(), [1], '2026-11-10')).toBeNull();
  });

  it('la plata la hace la cuenta de la casa, y el motor la acepta', () => {
    const q = cotizacion({ discount_percentage: 10 });
    const { parche } = parcheDe(q, foto());
    // Cena: (500 + 9.000 + 1.800) × 40; desayuno: 1.000 × 40.
    expect(parche.subtotal_amount).toBe(452_000 + 40_000);
    expect(parche.discount_amount).toBe(0);
    expect(parche.total_amount).toBe(Math.round(492_000 * 0.9));
    expect(
      verifyMoney(parche, {
        items: parche.items as never,
        people_count: 40,
        children_count: 0,
        discount_percentage: 10,
        discount_amount: 0,
        tip_percentage: null,
      }),
    ).toEqual([]);
  });

  it('las cuotas: si sube, crecen las por pagar que no han vencido', () => {
    const r = cuotasDespues(
      [
        {
          id: 'c1',
          payment_number: 1,
          amount: 500_000,
          due_date: '2026-10-01',
          status: 'pagado',
          payment_type: null,
        },
        {
          id: 'c2',
          payment_number: 2,
          amount: 500_000,
          due_date: '2026-12-01',
          status: 'pendiente',
          payment_type: null,
        },
      ],
      [
        {
          payment_id: 'c1',
          amount: 500_000,
          payment_method: 'transferencia',
          transaction_date: '2026-10-01',
        },
      ],
      [],
      100_000,
      '2026-11-03',
    );
    expect(r.cuotas).toEqual([
      expect.objectContaining({ cuota: 1, despues: '$500.000' }),
      expect.objectContaining({ cuota: 2, despues: '$600.000' }),
    ]);
  });

  it('las cuotas: un reembolso pendiente se compensa primero', () => {
    const r = cuotasDespues(
      [
        {
          id: 'c1',
          payment_number: 1,
          amount: 1_000_000,
          due_date: '2026-12-01',
          status: 'pendiente',
          payment_type: null,
        },
      ],
      [],
      [{ amount: 30_000, is_paid: false, refund_date: null }],
      100_000,
      '2026-11-03',
    );
    expect(r.reembolso_compensado).toBe('$30.000');
    expect(r.cuotas[0].despues).toBe('$1.070.000');
  });
});

describe('Sí, aplicar', () => {
  it('aplica por la puerta del cotizador y lo anota a nombre del Asistente', async () => {
    const q = cotizacion();
    const { servicio, cotizaciones, bitacora, repositorio } = armarServicio(q);
    const r = await servicio.aplicar(camila(), 'p1');
    expect(r.estado).toBe('aplicada');
    expect(cotizaciones.update).toHaveBeenCalledWith(
      'q500',
      expect.objectContaining({ total_amount: expect.any(Number) }),
      1,
      UserRole.VENDEDOR,
      expect.anything(),
    );
    expect(repositorio.moverPropuesta).toHaveBeenCalledWith(
      1,
      'p1',
      'pendiente',
      { estado: 'aplicando' },
    );
    const [, nota] = bitacora.crearComoAsistente.mock.calls[0] as [
      number,
      { note: string },
    ];
    expect(nota.note).toContain('a pedido de Camila');
  });

  it('si alguien cambió la cotización entre medio, no aplica', async () => {
    const q = cotizacion();
    const { servicio, cotizaciones, repositorio } = armarServicio(q);
    repositorio.cotizacionParaCambiar.mockResolvedValue(
      cotizacion({ people_count: 45 }),
    );
    await expect(servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cotizaciones.update).not.toHaveBeenCalled();
    expect(repositorio.moverPropuesta).toHaveBeenLastCalledWith(
      1,
      'p1',
      'aplicando',
      { estado: 'vencida' },
    );
  });

  it('solo la aplica quien la pidió', async () => {
    const { servicio, cotizaciones } = armarServicio(cotizacion());
    await expect(
      servicio.aplicar({ ...camila(), id: 'otra-persona' } as User, 'p1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('dos clics: si otro pedido ya la tomó, no la aplica de nuevo', async () => {
    const { servicio, cotizaciones, repositorio } = armarServicio(cotizacion());
    repositorio.moverPropuesta.mockResolvedValueOnce(false);
    await expect(servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('una ya aplicada o vencida no se aplica', async () => {
    const { servicio, cotizaciones } = armarServicio(cotizacion(), {
      estado: 'aplicada',
    });
    await expect(servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const vieja = armarServicio(cotizacion(), {
      vence_at: new Date(Date.now() - 1_000).toISOString(),
    });
    await expect(vieja.servicio.aplicar(camila(), 'p1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cotizaciones.update).not.toHaveBeenCalled();
    expect(vieja.cotizaciones.update).not.toHaveBeenCalled();
  });

  it('el día pasa: lo que tocaba un día que ya se está sirviendo no se aplica', async () => {
    // Un evento aceptado que empezó ayer: hoy es su día 2.
    const q = cotizacion({
      quotation_status: QuotationStatus.ACEPTADA,
      event_date: `${sumarDias(hoy, -1)}T00:00:00+00:00`,
      event_end_date: `${sumarDias(hoy, 3)}T00:00:00+00:00`,
    });
    const { servicio, cotizaciones } = armarServicio(q, {
      despues: {
        cambios: [],
        parche: parcheDe(q, foto()).parche,
        dias_tocados: [2],
        bajan_personas: false,
      },
    });
    await expect(
      servicio.aplicar(camila(UserRole.OPERACIONES), 'p1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('con compras hechas, operaciones no baja personas', async () => {
    const q = cotizacion({
      quotation_status: QuotationStatus.ACEPTADA,
      event_date: `${sumarDias(hoy, 10)}T00:00:00+00:00`,
      event_end_date: `${sumarDias(hoy, 12)}T00:00:00+00:00`,
    });
    const { servicio, cotizaciones, repositorio } = armarServicio(q, {
      despues: {
        cambios: [],
        parche: parcheDe(q, foto()).parche,
        dias_tocados: [1],
        bajan_personas: true,
      },
    });
    repositorio.comprasDelEvento.mockResolvedValue(3);
    await expect(
      servicio.aplicar(camila(UserRole.OPERACIONES), 'p1'),
    ).rejects.toMatchObject({ status: 403 });
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('proponer sobre algo realizado no arma nada', async () => {
    const q = cotizacion({ quotation_status: QuotationStatus.REALIZADA });
    const { servicio, repositorio } = armarServicio(q);
    await expect(
      servicio.proponerServicios(
        camila(UserRole.ADMINISTRADOR),
        { numero: 500 },
        [{ accion: 'personas', dia: 1, categoria: 'Cena', personas: 35 }],
        'Cinco menos en la cena',
        hoy,
      ),
    ).rejects.toBeInstanceOf(ErrorDeHerramienta);
    expect(repositorio.crearPropuesta).not.toHaveBeenCalled();
  });
});
