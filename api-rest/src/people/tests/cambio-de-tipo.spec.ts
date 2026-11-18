import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';
import type { TipoDePersonaRepository } from '../tipo-de-persona.repository';
import { TipoDePersonaService } from '../tipo-de-persona.service';
import { planDelCambioDeTipo, type FilaDeStaff } from '../utils/cambio-de-tipo';
import {
  conTipoVigente,
  esPlantaDesde,
  hoyEnChile,
  proximoCambio,
  tipoALaFecha,
  type CambioDeTipo,
} from '../utils/tipo-vigente';

/**
 * LA VENTANA «DESDE» (doc 10 §12, 17-11-2026). Felipe: *"la ventana desde
 * desarrollemos en el laboratorio"*. Caso real: Sofía pasó a planta el
 * 01-11, pero se registró después.
 */

const HOY = hoyEnChile();
const mas = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const fila = (over: Partial<FilaDeStaff>): FilaDeStaff => ({
  id: 1,
  day: HOY,
  quotation_id: null,
  kind: 'freelance',
  amount: null,
  tip_amount: null,
  payroll_id: null,
  tip_payroll_id: null,
  ajuste: null,
  solo_propina: false,
  ...over,
});

describe('tipoALaFecha: el tipo que rige un día', () => {
  const sofia = {
    default_kind: 'planta',
    historial_tipo: [
      { kind: 'planta', anterior: 'freelance', desde: '2026-11-01' },
    ] as CambioDeTipo[],
  };

  it('sin historial rige default_kind, como siempre', () => {
    expect(tipoALaFecha({ default_kind: 'planta' }, '2020-01-01')).toBe(
      'planta',
    );
    expect(tipoALaFecha({ default_kind: null }, '2020-01-01')).toBe(
      'freelance',
    );
  });

  it('antes del primer cambio rige su «anterior», desde la fecha el nuevo', () => {
    expect(tipoALaFecha(sofia, '2026-10-31')).toBe('freelance');
    expect(tipoALaFecha(sofia, '2026-11-01')).toBe('planta');
    expect(tipoALaFecha(sofia, '2027-03-01')).toBe('planta');
  });

  it('con el mismo «desde», manda el último que se registró', () => {
    const dos = {
      historial_tipo: [
        {
          kind: 'freelance',
          anterior: 'planta',
          desde: '2026-11-01',
          registrado_en: '2026-11-17T15:00:00Z',
        },
        {
          kind: 'planta',
          anterior: 'freelance',
          desde: '2026-11-01',
          registrado_en: '2026-11-17T12:00:00Z',
        },
      ] as CambioDeTipo[],
    };
    expect(tipoALaFecha(dos, '2026-11-05')).toBe('freelance');
  });

  it('conTipoVigente deja default_kind en el tipo de HOY y solo su historial', () => {
    const futuro = mas(HOY, 10);
    const leida = conTipoVigente(
      { id: 7, default_kind: 'freelance' as const },
      [
        { person_id: 7, kind: 'planta', anterior: 'freelance', desde: futuro },
        { person_id: 8, kind: 'freelance', anterior: 'planta', desde: HOY },
      ],
      HOY,
    );
    expect(leida.default_kind).toBe('freelance'); // todavía no llega
    expect(leida.historial_tipo).toHaveLength(1);
    expect(proximoCambio(leida, HOY)?.desde).toBe(futuro);
    expect(esPlantaDesde(leida, HOY)).toBe(true);

    const yaLlego = conTipoVigente(
      { id: 7, default_kind: 'freelance' as const },
      [{ person_id: 7, kind: 'planta', anterior: 'freelance', desde: HOY }],
      HOY,
    );
    expect(yaLlego.default_kind).toBe('planta');
  });
});

describe('planDelCambioDeTipo', () => {
  const aPlantaDesde = (desde: string) => ({
    historial_tipo: [
      { kind: 'planta', anterior: 'freelance', desde },
    ] as CambioDeTipo[],
  });
  const aFreelanceDesde = (desde: string) => ({
    historial_tipo: [
      { kind: 'freelance', anterior: 'planta', desde },
    ] as CambioDeTipo[],
  });

  it('fecha pasada: sus días de staff desde esa fecha pasan a planta, sin monto y confirmados', () => {
    const desde = mas(HOY, -16);
    const plan = planDelCambioDeTipo({
      filas: [
        fila({ id: 1, day: mas(HOY, -20), amount: 30000 }), // antes: no
        fila({ id: 2, day: mas(HOY, -10), amount: 30000 }),
        fila({ id: 3, day: mas(HOY, -3) }),
      ],
      persona: aPlantaDesde(desde),
      desde,
      hoy: HOY,
      liquidados: new Set(),
    });
    expect(plan.aPlanta).toBe(2);
    expect(plan.cambios).toEqual([
      {
        ids: [2, 3],
        datos: {
          kind: 'planta',
          amount: null,
          status: 'confirmado',
          ajuste: null,
        },
      },
    ]);
    expect(plan.quitar).toEqual([]);
  });

  it('a planta en su día libre: queda como día puesto a mano, para que la proyección no lo borre', () => {
    const desde = mas(HOY, -16);
    const elDia = mas(HOY, -3);
    const plan = planDelCambioDeTipo({
      filas: [fila({ id: 3, day: elDia })],
      persona: {
        ...aPlantaDesde(desde),
        days_off: [new Date(`${elDia}T00:00:00Z`).getUTCDay()],
      },
      desde,
      hoy: HOY,
      liquidados: new Set(),
    });
    expect(plan.aPlanta).toBe(1);
    expect(plan.cambios).toEqual([
      {
        ids: [3],
        datos: {
          kind: 'planta',
          amount: null,
          status: 'confirmado',
          ajuste: 'trabaja',
        },
      },
    ]);
  });

  it('lo que ya está en una nómina o liquidado NO se toca, y se cuenta', () => {
    const desde = mas(HOY, -16);
    const liquidado = mas(HOY, -8);
    const plan = planDelCambioDeTipo({
      filas: [
        fila({ id: 1, day: mas(HOY, -10), payroll_id: 4 }),
        fila({ id: 2, day: mas(HOY, -9), tip_payroll_id: 4 }),
        fila({ id: 3, day: liquidado, amount: 25000 }),
        fila({ id: 4, day: mas(HOY, -2) }),
      ],
      persona: aPlantaDesde(desde),
      desde,
      hoy: HOY,
      liquidados: new Set([liquidado]),
    });
    expect(plan.sinTocar).toBe(3);
    expect(plan.cambios.flatMap((c) => c.ids)).toEqual([4]);
  });

  it('los días de eventos y la fila solo-de-propina no cambian', () => {
    const desde = mas(HOY, -16);
    const plan = planDelCambioDeTipo({
      filas: [
        fila({ id: 1, day: mas(HOY, -5), quotation_id: 'evento-1' }),
        fila({ id: 2, day: mas(HOY, -5), solo_propina: true }),
      ],
      persona: aPlantaDesde(desde),
      desde,
      hoy: HOY,
      liquidados: new Set(),
    });
    expect(plan.cambios).toEqual([]);
    expect(plan.quitar).toEqual([]);
    expect(plan.sinTocar).toBe(0);
  });

  it('de planta a freelance: se quita lo que puso el sistema y lo trabajado queda freelance esperando monto', () => {
    const desde = mas(HOY, -5);
    const plan = planDelCambioDeTipo({
      filas: [
        // ya trabajó: queda freelance, por confirmar
        fila({ id: 1, day: mas(HOY, -4), kind: 'planta' }),
        fila({ id: 2, day: HOY, kind: 'planta' }),
        // con asignación extra: freelance, sin volver a por confirmar
        fila({ id: 3, day: mas(HOY, -3), kind: 'planta', amount: 15000 }),
        // lo que puso el sistema y todavía no llega: fuera
        fila({ id: 4, day: mas(HOY, 2), kind: 'planta' }),
        fila({ id: 5, day: mas(HOY, 3), kind: 'planta' }),
        // un día dormido que viene: fuera; uno que pasó: queda
        fila({ id: 6, day: mas(HOY, 4), kind: 'planta', ajuste: 'descansa' }),
        fila({ id: 7, day: mas(HOY, -2), kind: 'planta', ajuste: 'descansa' }),
        // un día puesto a mano que viene: freelance
        fila({ id: 8, day: mas(HOY, 6), kind: 'planta', ajuste: 'trabaja' }),
        // un freelance ya lo era: no cambia
        fila({ id: 9, day: mas(HOY, -1), kind: 'freelance', amount: 20000 }),
      ],
      persona: aFreelanceDesde(desde),
      desde,
      hoy: HOY,
      liquidados: new Set(),
    });
    expect(plan.quitar).toEqual([4, 5, 6]);
    expect(plan.cambios).toEqual([
      {
        ids: [1, 2, 8],
        datos: { kind: 'freelance', ajuste: null, status: 'por_confirmar' },
      },
      { ids: [3], datos: { kind: 'freelance', ajuste: null } },
    ]);
    expect(plan.aFreelance).toBe(4);
  });

  it('fecha futura: hasta ese día no se toca nada; desde ese día, sí', () => {
    const desde = mas(HOY, 10);
    const plan = planDelCambioDeTipo({
      filas: [
        fila({ id: 1, day: mas(HOY, 12) }), // freelance puesto a mano
      ],
      persona: aPlantaDesde(desde),
      desde,
      hoy: HOY,
      liquidados: new Set(),
    });
    expect(plan.cambios.flatMap((c) => c.ids)).toEqual([1]);
  });
});

// ---- La proyección y el servicio ----

const logger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

/** Los días que la proyección mandó a crear en su único viaje. */
const diasCreados = (m: jest.Mock): string[] =>
  ((m.mock.calls as unknown[][])[0][0] as { day: string }[]).map((r) => r.day);

describe('proyectarPlanta lee el tipo de cada día', () => {
  const armar = (persona: Record<string, unknown>) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(persona),
      findAll: jest.fn().mockResolvedValue([persona]),
      findDePersonaDesde: jest.fn().mockResolvedValue([]),
      addStaffEnLote: jest
        .fn()
        .mockImplementation((rows: unknown[]) => Promise.resolve(rows.length)),
      removeStaffEnLote: jest.fn().mockResolvedValue(0),
      updateStaff: jest.fn().mockResolvedValue({}),
    };
    const service = new PeopleService(
      repo as unknown as PeopleRepository,
      logger() as never,
    );
    return { service, repo };
  };

  it('fecha futura: sigue como estaba hasta ese día y desde ahí se le cargan sus días de planta', async () => {
    const desde = mas(HOY, 10);
    const { service, repo } = armar({
      id: 7,
      status: 'activa',
      default_kind: 'freelance',
      days_off: [],
      historial_tipo: [{ kind: 'planta', anterior: 'freelance', desde }],
    });
    await service.proyectarPlanta(1, 7);
    const creadas = diasCreados(repo.addStaffEnLote).sort();
    expect(creadas[0]).toBe(desde);
    expect(creadas.every((d) => d >= desde)).toBe(true);
  });

  it('de planta a freelance desde mañana: deja de cargar desde esa fecha', async () => {
    const desde = mas(HOY, 1);
    const { service, repo } = armar({
      id: 7,
      status: 'activa',
      default_kind: 'planta',
      days_off: [],
      historial_tipo: [{ kind: 'freelance', anterior: 'planta', desde }],
    });
    await service.proyectarPlanta(1, 7);
    const creadas = diasCreados(repo.addStaffEnLote);
    expect(creadas).toEqual([HOY]);
  });

  it('la sábana proyecta también a quien pasa a planta más adelante', async () => {
    const { service, repo } = armar({
      id: 7,
      status: 'activa',
      default_kind: 'freelance',
      days_off: [],
      historial_tipo: [
        { kind: 'planta', anterior: 'freelance', desde: mas(HOY, 30) },
      ],
    });
    const r = await service.proyectarTodaLaPlanta(1);
    expect(r.personas).toBe(1);
    expect(repo.findOne).toHaveBeenCalledWith(7, 1);
  });
});

describe('TipoDePersonaService: registrar el cambio con su historial', () => {
  const armar = (persona: Record<string, unknown>, filas: FilaDeStaff[]) => {
    const repo = {
      diasDeStaffDesde: jest.fn().mockResolvedValue(filas),
      cambiarDias: jest.fn().mockResolvedValue(0),
      registrar: jest
        .fn()
        .mockImplementation((row: Record<string, unknown>) =>
          Promise.resolve({ id: 1, ...row }),
        ),
      guardarTipo: jest.fn().mockResolvedValue(undefined),
      tiposGuardados: jest.fn().mockResolvedValue([]),
    };
    const people = {
      findOne: jest.fn().mockResolvedValue(persona),
      diasLiquidados: jest.fn().mockResolvedValue(new Set()),
      removeStaffEnLote: jest.fn().mockResolvedValue(0),
      historialDeTipo: jest.fn().mockResolvedValue([]),
    };
    const peopleService = {
      proyectarPlanta: jest.fn().mockResolvedValue({}),
    };
    const service = new TipoDePersonaService(
      repo as unknown as TipoDePersonaRepository,
      people as unknown as PeopleRepository,
      peopleService as unknown as PeopleService,
      logger() as never,
    );
    return { service, repo, people, peopleService };
  };
  const USUARIO = { id: 'u-1', full_name: 'Felipe', email: 'f@x.cl' };

  it('fecha pasada: cambia sus días, guarda quién y cuándo, y el tipo de hoy', async () => {
    const desde = mas(HOY, -16);
    const { service, repo, people, peopleService } = armar(
      {
        id: 7,
        status: 'activa',
        default_kind: 'freelance',
        historial_tipo: [],
      },
      [fila({ id: 2, day: mas(HOY, -10), amount: 30000 })],
    );
    const r = await service.cambiar(1, 7, { kind: 'planta', desde }, USUARIO);
    expect(repo.cambiarDias).toHaveBeenCalledWith(
      1,
      [2],
      expect.objectContaining({ kind: 'planta', amount: null }),
    );
    expect(people.removeStaffEnLote).toHaveBeenCalledWith([], 1);
    expect(repo.registrar).toHaveBeenCalledWith({
      company_id: 1,
      person_id: 7,
      kind: 'planta',
      anterior: 'freelance',
      desde,
      registrado_por: 'u-1',
      registrado_por_nombre: 'Felipe',
    });
    expect(repo.guardarTipo).toHaveBeenCalledWith(1, 7, 'planta');
    expect(peopleService.proyectarPlanta).toHaveBeenCalledWith(1, 7);
    expect(r).toMatchObject({
      aPlanta: 1,
      futuro: false,
      anterior: 'freelance',
    });
  });

  it('fecha futura: la ficha sigue con el tipo de hoy', async () => {
    const desde = mas(HOY, 14);
    const { service, repo } = armar(
      {
        id: 7,
        status: 'activa',
        default_kind: 'freelance',
        historial_tipo: [],
      },
      [],
    );
    const r = await service.cambiar(1, 7, { kind: 'planta', desde }, USUARIO);
    expect(repo.guardarTipo).toHaveBeenCalledWith(1, 7, 'freelance');
    expect(r.futuro).toBe(true);
  });

  it('la vista previa cuenta, sin escribir nada', async () => {
    const desde = mas(HOY, -16);
    const { service, repo, people, peopleService } = armar(
      {
        id: 7,
        status: 'activa',
        default_kind: 'freelance',
        historial_tipo: [],
      },
      [
        fila({ id: 2, day: mas(HOY, -10), payroll_id: 3 }),
        fila({ id: 3, day: mas(HOY, -9) }),
      ],
    );
    const r = await service.previa(1, 7, { kind: 'planta', desde });
    expect(r).toMatchObject({ aPlanta: 1, sinTocar: 1 });
    expect(repo.cambiarDias).not.toHaveBeenCalled();
    expect(repo.registrar).not.toHaveBeenCalled();
    expect(people.removeStaffEnLote).not.toHaveBeenCalled();
    expect(peopleService.proyectarPlanta).not.toHaveBeenCalled();
  });

  it('si ya es de ese tipo en esa fecha, lo dice y no registra', async () => {
    const { service, repo } = armar(
      { id: 7, status: 'activa', default_kind: 'planta', historial_tipo: [] },
      [],
    );
    await expect(
      service.cambiar(1, 7, { kind: 'planta', desde: '2026-11-01' }, USUARIO),
    ).rejects.toThrow('Ya es de planta el 01-11-2026');
    expect(repo.registrar).not.toHaveBeenCalled();
  });

  it('una fecha que no existe se rechaza', async () => {
    const { service } = armar(
      {
        id: 7,
        status: 'activa',
        default_kind: 'freelance',
        historial_tipo: [],
      },
      [],
    );
    await expect(
      service.previa(1, 7, { kind: 'planta', desde: '2026-02-31' }),
    ).rejects.toThrow('Esa fecha no existe');
  });

  it('el PATCH de la ficha con el mismo tipo no registra nada; con otro, desde hoy', async () => {
    const { service, repo } = armar(
      {
        id: 7,
        status: 'activa',
        default_kind: 'freelance',
        historial_tipo: [],
      },
      [],
    );
    await service.cambiarSiEsOtro(1, 7, 'freelance', USUARIO);
    expect(repo.registrar).not.toHaveBeenCalled();
    await service.cambiarSiEsOtro(1, 7, 'planta', USUARIO);
    expect(repo.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'planta', desde: HOY }),
    );
  });

  it('ponerAlDia corrige el tipo guardado de quien ya llegó a su fecha', async () => {
    const { service, repo, people } = armar({}, []);
    repo.tiposGuardados.mockResolvedValue([
      { id: 7, default_kind: 'freelance' },
      { id: 8, default_kind: 'planta' },
    ]);
    people.historialDeTipo.mockResolvedValue([
      { person_id: 7, kind: 'planta', anterior: 'freelance', desde: HOY },
      {
        person_id: 8,
        kind: 'freelance',
        anterior: 'planta',
        desde: mas(HOY, 5),
      },
    ]);
    expect(await service.ponerAlDia(1)).toBe(1);
    expect(repo.guardarTipo).toHaveBeenCalledWith(1, 7, 'planta');
  });
});
