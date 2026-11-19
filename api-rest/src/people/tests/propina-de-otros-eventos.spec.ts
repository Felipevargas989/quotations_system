import type { PeopleRepository } from '../people.repository';
import { PeopleService, laMandaronAUnEvento } from '../people.service';
import type { PropinaDeOtrosEventosRepository } from '../propina-de-otros-eventos.repository';
import { PropinaDeOtrosEventosService } from '../propina-de-otros-eventos.service';
import {
  conOrigenDelEvento,
  esJornadaRealDeEvento,
  huerfanas,
  indiceDeOrigenes,
  noEsJornadaDeEvento,
  traidasDeOtrosEventos,
  traidasSinOrigenTrasSacar,
  type FilaDelDia,
} from '../utils/propina-de-otros-eventos';
import { daValorAlCargo } from '../utils/valor-del-cargo';

/**
 * LA GENTE DE LOS OTROS EVENTOS DEL DÍA (Felipe, 19-11-2026): "todos
 * participan en todo… a los que están asignados a B se les castiga
 * respecto a la A, y ambos trabajaron en todo". La ficha de B trae a los
 * anotados en A esos mismos días, como el citado como staff: sin monto y
 * con «sin propina» ya marcado.
 */
const DIA = '2026-11-14';
let siguiente = 1;
const fila = (f: Partial<FilaDelDia>): FilaDelDia => ({
  id: siguiente++,
  quotation_id: null,
  person_id: null,
  day: DIA,
  role_id: 2,
  kind: 'freelance',
  starts_at: '12:00',
  ends_at: '23:00',
  break_minutes: 30,
  solo_propina: false,
  ajuste: null,
  no_tip: false,
  amount: null,
  tip_amount: null,
  payroll_id: null,
  tip_payroll_id: null,
  ...f,
});
const deEvento = (q: string, numero: number, f: Partial<FilaDelDia> = {}) =>
  fila({
    quotation_id: q,
    quotations: {
      quotation_number: String(numero),
      quotation_status: 'realizada',
    },
    ...f,
  });
const traida = (q: string, personId: number, f: Partial<FilaDelDia> = {}) =>
  fila({
    quotation_id: q,
    person_id: personId,
    solo_propina: true,
    no_tip: true,
    ...f,
  });

describe('a quién trae la ficha de B desde los otros eventos', () => {
  it('trae al freelance anotado en A, solo-de-propina, sin monto, con «sin propina» marcado y el horario de A', () => {
    const a = deEvento('A', 522, {
      person_id: 8,
      role_id: 5,
      starts_at: '18:00',
    });
    const nuevas = traidasDeOtrosEventos({
      companyId: 1,
      quotationId: 'B',
      dias: [DIA],
      indice: indiceDeOrigenes([a]),
      yaEnEvento: [],
    });
    expect(nuevas).toEqual([
      expect.objectContaining({
        company_id: 1,
        quotation_id: 'B',
        person_id: 8,
        day: DIA,
        role_id: 5,
        kind: 'freelance',
        status: 'confirmado',
        amount: null,
        solo_propina: true,
        no_tip: true,
        starts_at: '18:00',
        ends_at: '23:00',
        break_minutes: 30,
      }),
    ]);
    // Y la proyección de la planta no la cuenta como «la mandaron a B».
    expect(laMandaronAUnEvento(nuevas[0])).toBe(false);
  });

  it('no repite a quien ya tiene fila en B ese día, ni a quien ese día fue staff (entra como «staff»)', () => {
    const a8 = deEvento('A', 522, { person_id: 8 });
    const a9 = deEvento('A', 522, { person_id: 9 });
    const staff9 = fila({ person_id: 9 });
    const nuevas = traidasDeOtrosEventos({
      companyId: 1,
      quotationId: 'B',
      dias: [DIA],
      indice: indiceDeOrigenes([a8, a9, staff9]),
      yaEnEvento: [deEvento('B', 530, { person_id: 8 })],
    });
    expect(nuevas).toHaveLength(0);
  });

  it('abrir la ficha dos veces no duplica (lo traído ya ocupa su día)', () => {
    const a = deEvento('A', 522, { person_id: 8 });
    const indice = indiceDeOrigenes([a]);
    const primera = traidasDeOtrosEventos({
      companyId: 1,
      quotationId: 'B',
      dias: [DIA],
      indice,
      yaEnEvento: [],
    });
    const segunda = traidasDeOtrosEventos({
      companyId: 1,
      quotationId: 'B',
      dias: [DIA],
      indice,
      yaEnEvento: primera.map((f, i) => ({ ...f, id: 900 + i })),
    });
    expect(primera).toHaveLength(1);
    expect(segunda).toHaveLength(0);
  });

  it('cadena prohibida: un traído, la planta traída, la silla vacía y la fila dormida no se traen', () => {
    const filas = [
      traida('A', 8), // traído a A desde otro lado
      deEvento('A', 522, { person_id: 9, kind: 'planta' }), // planta que la ficha de A trajo
      deEvento('A', 522, { person_id: null }), // silla vacía
      deEvento('A', 522, { person_id: 10, ajuste: 'descansa' }),
    ];
    expect(filas.map(esJornadaRealDeEvento)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    const nuevas = traidasDeOtrosEventos({
      companyId: 1,
      quotationId: 'B',
      dias: [DIA],
      indice: indiceDeOrigenes(filas),
      yaEnEvento: [],
    });
    expect(nuevas).toHaveLength(0);
  });

  it('solo los días en que coincidió, y nunca desde un evento anulado', () => {
    const otroDia = deEvento('A', 522, { person_id: 8, day: '2026-11-20' });
    const anulado = deEvento('C', 540, {
      person_id: 9,
      quotations: { quotation_number: 540, quotation_status: 'anulada' },
    });
    const nuevas = traidasDeOtrosEventos({
      companyId: 1,
      quotationId: 'B',
      dias: [DIA],
      indice: indiceDeOrigenes([otroDia, anulado]),
      yaEnEvento: [],
    });
    expect(nuevas).toHaveLength(0);
  });

  it('si coincidió con dos eventos, una sola fila con el horario del de número menor', () => {
    const c = deEvento('C', 540, { person_id: 8, starts_at: '20:00' });
    const a = deEvento('A', 522, { person_id: 8, starts_at: '10:00' });
    const nuevas = traidasDeOtrosEventos({
      companyId: 1,
      quotationId: 'B',
      dias: [DIA],
      indice: indiceDeOrigenes([c, a]),
      yaEnEvento: [],
    });
    expect(nuevas).toHaveLength(1);
    expect(nuevas[0].starts_at).toBe('10:00');
  });
});

describe('la etiqueta de la caja del monto: «evento N» o «staff»', () => {
  it('la traída de A dice 522; la del staff y la planta traída, null (la pantalla dice «staff» o «planta»)', () => {
    const delDia = [
      deEvento('A', 522, { person_id: 8 }),
      deEvento('C', 540, { person_id: 8 }),
      fila({ person_id: 9 }), // staff ese día
    ];
    const enB = [
      traida('B', 8),
      traida('B', 9),
      deEvento('B', 530, { person_id: 7, kind: 'planta' }),
      deEvento('B', 530, { person_id: 6 }),
    ];
    const conOrigen = conOrigenDelEvento('B', enB, indiceDeOrigenes(delDia));
    expect(conOrigen.map((f) => f.origen_evento)).toEqual([
      522,
      null,
      null,
      null,
    ]);
  });

  it('con jornada de staff Y en otro evento el mismo día, manda «staff» (como desde el 22-09)', () => {
    const delDia = [
      deEvento('A', 522, { person_id: 8 }),
      fila({ person_id: 8 }),
    ];
    const [f] = conOrigenDelEvento(
      'B',
      [traida('B', 8)],
      indiceDeOrigenes(delDia),
    );
    expect(f.origen_evento).toBeNull();
  });
});

describe('las traídas huérfanas', () => {
  it('se borra la traída intacta que ya no viene de ninguna parte, también la que quedó fuera de los días del evento', () => {
    const sinOrigen = traida('B', 8);
    const fueraDeDias = traida('B', 9, { day: '2026-11-30' });
    const conOrigen = traida('B', 10);
    const delStaff = traida('B', 11);
    const indice = indiceDeOrigenes([
      deEvento('A', 522, { person_id: 10 }),
      fila({ person_id: 11 }),
    ]);
    expect(
      huerfanas({
        quotationId: 'B',
        dias: [DIA],
        indice,
        filasDelEvento: [sinOrigen, fueraDeDias, conOrigen, delStaff],
      }),
    ).toEqual([sinOrigen.id, fueraDeDias.id]);
  });

  it('jamás se borra una traída con monto, propina, sello, «sin propina» desmarcado, ni la planta traída', () => {
    const filasDelEvento = [
      traida('B', 1, { amount: 10_000 }),
      traida('B', 2, { tip_amount: '4500' }),
      traida('B', 3, { payroll_id: 4 }),
      traida('B', 4, { tip_payroll_id: 4 }),
      traida('B', 5, { no_tip: false }),
      deEvento('B', 530, { person_id: 6, kind: 'planta' }),
    ];
    expect(
      huerfanas({
        quotationId: 'B',
        dias: [DIA],
        indice: indiceDeOrigenes([]),
        filasDelEvento,
      }),
    ).toEqual([]);
  });

  it('al sacar a alguien de A, su traída intacta de B se va; si sigue en C, se queda; una ficha cerrada no se toca', () => {
    const enB = traida('B', 8);
    const enD = traida('D', 8);
    expect(
      traidasSinOrigenTrasSacar({
        filasDeLaPersona: [enB, enD],
        cerradas: new Set(['D']),
      }),
    ).toEqual([enB.id]);
    expect(
      traidasSinOrigenTrasSacar({
        filasDeLaPersona: [enB, deEvento('C', 540, { person_id: 8 })],
        cerradas: new Set(),
      }),
    ).toEqual([]);
  });
});

describe('los invitados del día no se duplican con las traídas', () => {
  it('una fila solo-de-propina con evento no es una jornada de evento para invitar al día', () => {
    expect(noEsJornadaDeEvento(traida('B', 8))).toBe(true);
    expect(noEsJornadaDeEvento(deEvento('A', 522, { person_id: 8 }))).toBe(
      false,
    );
    expect(noEsJornadaDeEvento(null)).toBe(true);
  });

  it('el reparto del día rechaza invitar por la traída de B', async () => {
    const repo = {
      findPool: jest.fn().mockResolvedValue({
        id: 9,
        quotation_id: null,
        day: DIA,
        first_amount: 10_000,
        second_amount: 0,
      }),
      findPlantaDelDia: jest.fn().mockResolvedValue([]),
      personasQueDescansan: jest.fn().mockResolvedValue([]),
      findStaffPorId: jest.fn().mockResolvedValue(traida('B', 8, { id: 101 })),
      addStaffEnLote: jest.fn(),
    };
    const service = new PeopleService(
      repo as unknown as PeopleRepository,
      { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() } as never,
    );
    await expect(
      service.repartir(
        9,
        { porcentajes: [{ role_id: 2, pct: 100 }], invitados: [101] },
        1,
      ),
    ).rejects.toThrow('no es una jornada de evento');
    await expect(
      service.soloPropinaDelDia({ evento_staff_id: 101, no_tip: true }, 1),
    ).rejects.toThrow('no es una jornada de evento');
    expect(repo.addStaffEnLote).not.toHaveBeenCalled();
  });
});

describe('el adicional de una traída no es precio del cargo', () => {
  it('no valoriza las sillas vacías de B', () => {
    expect(daValorAlCargo({ ...traida('B', 8), amount: 10_000 })).toBe(false);
    expect(
      daValorAlCargo({
        quotation_id: 'B',
        role_id: 2,
        kind: 'freelance',
        amount: 10_000,
      }),
    ).toBe(true);
  });
});

describe('PropinaDeOtrosEventosService', () => {
  const armar = (o: {
    delDia: FilaDelDia[];
    delEvento: FilaDelDia[];
    filasDeLaPersona?: FilaDelDia[];
    filaSacada?: FilaDelDia | null;
    cerradas?: string[];
  }) => {
    const people = {
      traerPlantaAlEvento: jest.fn().mockResolvedValue({ traidos: 2 }),
      removeStaff: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const peopleRepo = {
      diasDeEvento: jest.fn().mockResolvedValue([DIA]),
      findStaff: jest.fn().mockResolvedValue(o.delEvento),
      findStaffRow: jest.fn().mockResolvedValue(o.filaSacada ?? null),
      fichasCerradas: jest.fn().mockResolvedValue(new Set(o.cerradas ?? [])),
      addStaffEnLote: jest
        .fn()
        .mockImplementation((f: unknown[]) => Promise.resolve(f.length)),
      removeStaffEnLote: jest.fn().mockResolvedValue(0),
    };
    const repo = {
      filasDeLosDias: jest
        .fn()
        .mockImplementation((_c: number, _d: string[], personas?: number[]) =>
          Promise.resolve(
            personas ? (o.filasDeLaPersona ?? o.delDia) : o.delDia,
          ),
        ),
    };
    const service = new PropinaDeOtrosEventosService(
      people as unknown as PeopleService,
      peopleRepo as unknown as PeopleRepository,
      repo as unknown as PropinaDeOtrosEventosRepository,
      { setContext: jest.fn(), info: jest.fn() } as never,
    );
    return { service, people, peopleRepo, repo };
  };

  it('abrir la ficha: primero la planta y el staff de siempre, después los otros eventos, y limpia las huérfanas', async () => {
    const huerfana = traida('B', 3);
    const { service, people, peopleRepo } = armar({
      delDia: [deEvento('A', 522, { person_id: 8 })],
      delEvento: [huerfana],
    });
    const r = await service.traerAlEvento('B', 1);
    expect(people.traerPlantaAlEvento).toHaveBeenCalledWith('B', 1);
    expect(peopleRepo.removeStaffEnLote).toHaveBeenCalledWith([huerfana.id], 1);
    expect(peopleRepo.addStaffEnLote).toHaveBeenCalledWith([
      expect.objectContaining({
        quotation_id: 'B',
        person_id: 8,
        no_tip: true,
      }),
    ]);
    expect(r).toEqual({ traidos: 3, de_otros_eventos: 1 });
  });

  it('con la ficha cerrada no trae ni borra nada', async () => {
    const { service, people, peopleRepo } = armar({
      delDia: [deEvento('A', 522, { person_id: 8 })],
      delEvento: [traida('B', 3)],
      cerradas: ['B'],
    });
    const r = await service.traerAlEvento('B', 1);
    expect(r).toEqual({ traidos: 0, de_otros_eventos: 0 });
    expect(people.traerPlantaAlEvento).not.toHaveBeenCalled();
    expect(peopleRepo.addStaffEnLote).not.toHaveBeenCalled();
    expect(peopleRepo.removeStaffEnLote).not.toHaveBeenCalled();
  });

  it('leer el staff de B le pone origen_evento a la traída, sin leer nada si no hay traídas', async () => {
    const { service, repo } = armar({
      delDia: [deEvento('A', 522, { person_id: 8 })],
      delEvento: [],
    });
    const sinTraidas = await service.conOrigen(1, 'B', [
      deEvento('B', 530, { person_id: 6 }) as never,
    ]);
    expect(sinTraidas[0].origen_evento).toBeNull();
    expect(repo.filasDeLosDias).not.toHaveBeenCalled();
    const [f] = await service.conOrigen(1, 'B', [traida('B', 8) as never]);
    expect(f.origen_evento).toBe(522);
    expect(repo.filasDeLosDias).toHaveBeenCalledWith(1, [DIA], [8]);
  });

  it('sacar a alguien de A se lleva su traída intacta de B (no la de una ficha cerrada)', async () => {
    const enB = traida('B', 8);
    const enD = traida('D', 8);
    const { service, people, peopleRepo } = armar({
      delDia: [],
      delEvento: [],
      filaSacada: deEvento('A', 522, { person_id: 8 }),
      filasDeLaPersona: [enB, enD],
      cerradas: ['D'],
    });
    await service.sacar(77, 1, true);
    expect(people.removeStaff).toHaveBeenCalledWith(77, 1, true);
    expect(peopleRepo.removeStaffEnLote).toHaveBeenCalledWith([enB.id], 1);
  });

  it('sacar una traída no busca nada más', async () => {
    const { service, peopleRepo, repo } = armar({
      delDia: [],
      delEvento: [],
      filaSacada: traida('B', 8),
    });
    await service.sacar(77, 1, false);
    expect(repo.filasDeLosDias).not.toHaveBeenCalled();
    expect(peopleRepo.removeStaffEnLote).not.toHaveBeenCalled();
  });
});
