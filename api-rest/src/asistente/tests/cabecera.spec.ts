import { QuotationStatus } from 'src/quotations/constants/constants';
import { verifyMoney } from 'src/quotations/utils/money';
import { UserRole } from 'src/users/entities/user.entity';
import { ErrorDeHerramienta } from '../herramientas/comun';
import { leerCabecera } from '../herramientas/proponer';
import {
  conFechaNueva,
  conPersonasNuevas,
  deTemporada,
  fijosPorPersona,
  topeDeDescuento,
} from '../propuestas/cabecera';
import type { FotoGuardada } from '../propuestas/editar-foto';
import { parcheDe } from '../propuestas/reglas';
import {
  armarServicio,
  camila,
  cotizacion,
  foto,
  hoy,
} from './datos-de-prueba';

// LAS PERSONAS DEL EVENTO Y EL DESCUENTO, COMO PROPUESTA (Felipe,
// 04-11-2026). La cuenta tiene que ser la del cotizador: guardar después en
// la pantalla no puede mover el total ni un peso.

describe('Las personas del evento, como las cambia el cotizador', () => {
  it('la casilla que tenía el total de su audiencia lo sigue; la ajustada a mano no', () => {
    const f: FotoGuardada = {
      ...foto(),
      variable_services: [
        ...(foto().variable_services ?? []),
        // Un ajuste a mano: el almuerzo es solo para 25.
        {
          category: 'Almuerzo',
          day: 2,
          audience: 'adultos',
          people: 25,
          items: [{ codigo: '9', precio: 7_000, quantity: 1 }],
        },
      ],
    };
    const r = conPersonasNuevas(
      f,
      { adultos: 40, ninos: 0 },
      { adultos: 42, ninos: 8 },
    );
    const personas = (r.foto.variable_services ?? []).map((c) => c.people);
    expect(personas).toEqual([42, 42, 25]);
    expect(r.lineas.map((l) => l.personas)).toEqual([
      { antes: 40, despues: 42 },
      { antes: 40, despues: 42 },
    ]);
  });

  it('las de niños siguen a los niños', () => {
    const f: FotoGuardada = {
      variable_services: [
        { category: 'Once', day: 1, audience: 'ninos', people: 5, items: [] },
      ],
    };
    const r = conPersonasNuevas(
      f,
      { adultos: 40, ninos: 5 },
      { adultos: 40, ninos: 9 },
    );
    expect(r.foto.variable_services?.[0].people).toBe(9);
  });

  it('avisa los fijos que cobran por persona: el cotizador no les rehace el precio', () => {
    const f: FotoGuardada = {
      ...foto(),
      fixed_services: [
        {
          codigo: '30',
          nombre: 'Garzones',
          precio: 120_000,
          quantity: 1,
          tipo_calculo: 'fijo_variable',
          precio_por_persona: 2_000,
        },
        {
          codigo: '31',
          nombre: 'Salón',
          precio: 300_000,
          quantity: 1,
          tipo_calculo: 'fijo',
        },
      ],
    };
    expect(fijosPorPersona(f)).toEqual(['Garzones']);
  });
});

describe('El tope de descuento de cada cargo, el del cotizador', () => {
  it('administración 40 %, ventas y operaciones 15 %, recepción nada', () => {
    expect(topeDeDescuento(UserRole.ADMINISTRADOR)).toBe(40);
    expect(topeDeDescuento(UserRole.VENDEDOR)).toBe(15);
    expect(topeDeDescuento(UserRole.OPERACIONES)).toBe(15);
    expect(topeDeDescuento(UserRole.RECEPCION)).toBe(0);
  });
});

describe('Lo que manda la IA', () => {
  it('lee las personas y el descuento; uno de los dos modos del descuento', () => {
    expect(
      leerCabecera({ personas_del_evento: { total: 50, ninos: 10 } }),
    ).toEqual({ personas: { total: 50, ninos: 10 } });
    expect(leerCabecera({ descuento: { porcentaje: 10 } })).toEqual({
      descuento: { porcentaje: 10 },
    });
    expect(leerCabecera({})).toBeUndefined();
    expect(() =>
      leerCabecera({ descuento: { porcentaje: 10, monto: 5_000 } }),
    ).toThrow(ErrorDeHerramienta);
    expect(() => leerCabecera({ personas_del_evento: { ninos: 3 } })).toThrow(
      ErrorDeHerramienta,
    );
  });
});

describe('La propuesta con personas y descuento', () => {
  it('sube las personas en una no aceptada: las casillas siguen y la cuenta la acepta el motor', async () => {
    const q = cotizacion();
    const { servicio, repositorio } = armarServicio(q);
    const t = await servicio.proponerServicios(
      camila(),
      { numero: 500 },
      [],
      'Cincuenta personas, diez niños',
      hoy,
      {
        personas: { total: 50, ninos: 10 },
      },
    );
    expect(t.lineas[0]).toMatchObject({
      dia: 'Todo el evento',
      que: 'Personas del evento: 40 personas → 40 adultos y 10 niños',
    });
    const guardada = (
      repositorio.crearPropuesta.mock.calls as unknown[][]
    )[0][0] as {
      antes: Record<string, unknown>;
      despues: { parche: Record<string, unknown> & { items: FotoGuardada } };
    };
    const parche = guardada.despues.parche;
    expect(parche).toMatchObject({ people_count: 50, children_count: 10 });
    // Los adultos eran 40 y siguen siendo 40: las casillas no cambian.
    expect(parche.items.variable_services?.map((c) => c.people)).toEqual([
      40, 40,
    ]);
    expect(guardada.antes).toMatchObject({
      people_count: 40,
      children_count: 0,
    });
    expect(
      verifyMoney(parche as never, {
        items: parche.items as never,
        people_count: 50,
        children_count: 10,
        discount_percentage: 0,
        discount_amount: 0,
        tip_percentage: null,
      }),
    ).toEqual([]);
  });

  it('en una aceptada, las personas no: se cambian en Post-Venta', async () => {
    const q = cotizacion({ quotation_status: QuotationStatus.ACEPTADA });
    const { servicio, repositorio } = armarServicio(q);
    await expect(
      servicio.proponerServicios(
        camila(UserRole.ADMINISTRADOR),
        { numero: 500 },
        [],
        'Más gente',
        hoy,
        { personas: { total: 60 } },
      ),
    ).rejects.toThrow('Post-Venta');
    expect(repositorio.crearPropuesta).not.toHaveBeenCalled();
  });

  it('el descuento que pide quien vende, hasta su 15 %', async () => {
    const q = cotizacion();
    const { servicio, repositorio } = armarServicio(q);
    const t = await servicio.proponerServicios(
      camila(),
      { numero: 500 },
      [],
      '10 % de descuento',
      hoy,
      {
        descuento: { porcentaje: 10 },
      },
    );
    expect(t.lineas[0].que).toBe('Descuento: sin descuento → 10 % ($49.200)');
    const parche = (
      (repositorio.crearPropuesta.mock.calls as unknown[][])[0][0] as {
        despues: { parche: Record<string, number> };
      }
    ).despues.parche;
    const { parche: esperado } = parcheDe(q, q.items ?? {}, {
      discount_percentage: 10,
      discount_amount: 0,
    });
    expect(parche.total_amount).toBe(esperado.total_amount);
    expect(parche.total_amount).toBe(Math.round(492_000 * 0.9));
    await expect(
      servicio.proponerServicios(camila(), { numero: 500 }, [], '20 %', hoy, {
        descuento: { porcentaje: 20 },
      }),
    ).rejects.toThrow('hasta 15 %');
  });

  it('el administrador llega al 40 %; por monto, el tope es el 40 % del subtotal', async () => {
    const q = cotizacion();
    const { servicio } = armarServicio(q);
    await expect(
      servicio.proponerServicios(
        camila(UserRole.ADMINISTRADOR),
        { numero: 500 },
        [],
        '40 %',
        hoy,
        { descuento: { porcentaje: 40 } },
      ),
    ).resolves.toBeDefined();
    await expect(
      servicio.proponerServicios(
        camila(UserRole.ADMINISTRADOR),
        { numero: 500 },
        [],
        'Rebaja',
        hoy,
        { descuento: { monto: 200_000 } },
      ),
    ).rejects.toThrow('$196.800');
  });

  it('si no cambia nada, no hay propuesta', async () => {
    const q = cotizacion();
    const { servicio } = armarServicio(q);
    await expect(
      servicio.proponerServicios(camila(), { numero: 500 }, [], 'Igual', hoy, {
        personas: { total: 40, ninos: 0 },
      }),
    ).rejects.toThrow('No cambia nada');
  });

  it('deshacer devuelve también las personas y el descuento', () => {
    const antes = cotizacion();
    const despues = cotizacion({ people_count: 50, children_count: 10 });
    const { parche } = parcheDe(despues, antes.items ?? {}, {
      people_count: 40,
      children_count: 0,
      discount_percentage: 0,
      discount_amount: 0,
    });
    expect(parche).toMatchObject({
      people_count: 40,
      children_count: 0,
      total_amount: 492_000,
    });
  });
});

// LA FECHA DEL EVENTO (doc 20 §17, mejora 3): solo en las no aceptadas, el
// evento entero se mueve y la tarjeta avisa si choca con un aceptado o si
// trae ítems de temporada.

const enDias = (dias: number): string => {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

describe('La fecha del evento', () => {
  it('se mueve el evento entero: el último día corre lo mismo', () => {
    const nueva = enDias(30);
    expect(
      conFechaNueva({ inicio: '2026-11-09', fin: '2026-11-11' }, nueva, hoy),
    ).toEqual({ event_date: nueva, event_end_date: enDias(32) });
    expect(
      conFechaNueva({ inicio: '2026-11-09', fin: null }, nueva, hoy),
    ).toEqual({ event_date: nueva, event_end_date: null });
  });

  it('la misma fecha no es cambio; una pasada o que no existe, no', () => {
    expect(
      conFechaNueva({ inicio: enDias(5), fin: null }, enDias(5), hoy),
    ).toBeNull();
    expect(() =>
      conFechaNueva({ inicio: enDias(5), fin: null }, enDias(-1), hoy),
    ).toThrow('ya pasó');
    expect(() =>
      conFechaNueva({ inicio: enDias(5), fin: null }, '2027-02-30', hoy),
    ).toThrow(ErrorDeHerramienta);
    expect(() =>
      conFechaNueva({ inicio: enDias(5), fin: null }, '21-11-2026', hoy),
    ).toThrow('AAAA-MM-DD');
  });

  it('lee la fecha que manda la IA', () => {
    expect(leerCabecera({ fecha_del_evento: ' 2026-12-05 ' })).toEqual({
      fecha: { inicio: '2026-12-05' },
    });
  });

  it('la propuesta mueve las dos fechas, guarda las de antes y revisa los topes', async () => {
    const q = cotizacion();
    const { servicio, repositorio, cotizaciones } = armarServicio(q);
    const nueva = enDias(30);
    const t = await servicio.proponerServicios(
      camila(),
      { numero: 500 },
      [],
      'Al mes que viene',
      hoy,
      { fecha: { inicio: nueva } },
    );
    expect(t.lineas[0]).toMatchObject({ dia: 'Todo el evento' });
    expect(t.lineas[0].que).toMatch(
      /^Fecha del evento: lun 09-11-2026 a mié 11-11-2026 → /,
    );
    expect(
      cotizaciones.checkConflictsWithExistingQuotations,
    ).toHaveBeenCalledWith(
      { event_date: nueva, event_end_date: enDias(32) },
      1,
    );
    const guardada = (
      repositorio.crearPropuesta.mock.calls as unknown[][]
    )[0][0] as {
      antes: Record<string, unknown>;
      despues: { parche: Record<string, unknown> };
    };
    expect(guardada.despues.parche).toMatchObject({
      event_date: nueva,
      event_end_date: enDias(32),
    });
    expect(guardada.antes).toMatchObject({
      event_date: '2026-11-09T00:00:00+00:00',
      event_end_date: '2026-11-11T00:00:00+00:00',
    });
    expect(t.avisos).toEqual([]);
  });

  it('si choca con un evento aceptado, lo avisa antes del «Sí, aplicar»', async () => {
    const q = cotizacion();
    const { servicio, cotizaciones } = armarServicio(q);
    cotizaciones.checkConflictsWithExistingQuotations.mockResolvedValue({
      has_conflicts: true,
    });
    const t = await servicio.proponerServicios(
      camila(),
      { numero: 500 },
      [],
      'Otra fecha',
      hoy,
      { fecha: { inicio: enDias(20) } },
    );
    expect(t.avisos[0]).toMatch(/tope de calendario/);
  });

  it('en una aceptada, la fecha no: se cambia en la pantalla', async () => {
    const q = cotizacion({ quotation_status: QuotationStatus.ACEPTADA });
    const { servicio, repositorio } = armarServicio(q);
    await expect(
      servicio.proponerServicios(
        camila(UserRole.ADMINISTRADOR),
        { numero: 500 },
        [],
        'Otra fecha',
        hoy,
        { fecha: { inicio: enDias(20) } },
      ),
    ).rejects.toThrow('aceptada');
    expect(repositorio.crearPropuesta).not.toHaveBeenCalled();
  });

  it('avisa los ítems de temporada: BelIA no los cambia sola', async () => {
    const f: FotoGuardada = {
      ...foto(),
      fixed_services: [
        {
          codigo: '77',
          nombre: 'Cabaña 4 personas temporada alta',
          precio: 130_000,
          quantity: 1,
        },
      ],
    };
    expect(deTemporada(f)).toEqual(['Cabaña 4 personas temporada alta']);
    const q = cotizacion({ items: f });
    const { servicio } = armarServicio(q);
    const t = await servicio.proponerServicios(
      camila(),
      { numero: 500 },
      [],
      'Otra fecha',
      hoy,
      { fecha: { inicio: enDias(40) } },
    );
    expect(t.avisos.join(' ')).toMatch(/temporada alta.*fecha nueva/);
  });

  it('deshacer devuelve las fechas de antes', () => {
    const despues = cotizacion({
      event_date: `${enDias(30)}T00:00:00+00:00`,
      event_end_date: `${enDias(32)}T00:00:00+00:00`,
    });
    const { parche } = parcheDe(despues, despues.items ?? {}, {
      people_count: 40,
      children_count: 0,
      event_date: '2026-11-09',
      event_end_date: '2026-11-11',
    });
    expect(parche).toMatchObject({
      event_date: '2026-11-09',
      event_end_date: '2026-11-11',
    });
  });
});
