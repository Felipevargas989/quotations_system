import type { PeopleRepository } from '../people.repository';
import { PeopleService, laMandaronAUnEvento } from '../people.service';
import { filaTraidaAlEvento } from '../utils/fila-traida-al-evento';

type FilaTraida = ReturnType<typeof filaTraidaAlEvento>;

/**
 * LA FICHA DEL EVENTO TRAE A TODOS LOS CITADOS ESOS DÍAS (Felipe, 22-09):
 * "los que estén citados como staff ese día, que puede ser un freelance
 * o gente de planta, y la gente de planta — la misma regla que tiene la
 * liquidación de los días de restaurante". Hasta ese día solo traía a la
 * planta: Paulo trabajó el 18-09 como staff durante el evento 499 y la
 * ficha no lo mostraba.
 */
const citado = (personId: number, kind: string, day = '2026-09-18') => ({
  id: personId * 10,
  quotation_id: null,
  person_id: personId,
  day,
  role_id: 2,
  kind,
  starts_at: '09:00',
  ends_at: '19:00',
  break_minutes: 30,
});

const armar = (citados: unknown[], yaEnEvento: unknown[] = []) => {
  const repo = {
    esCotizacionDeLaEmpresa: jest.fn().mockResolvedValue(true),
    diasDeEvento: jest.fn().mockResolvedValue(['2026-09-18']),
    citadosEnDias: jest.fn().mockResolvedValue(citados),
    findStaff: jest.fn().mockResolvedValue(yaEnEvento),
    addStaffEnLote: jest
      .fn<Promise<number>, [FilaTraida[]]>()
      .mockImplementation((filas) => Promise.resolve(filas.length)),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new PeopleService(
    repo as unknown as PeopleRepository,
    logger as never,
  );
  return { service, repo };
};

describe('la ficha del evento trae a los citados del día', () => {
  it('trae a la planta como siempre y al citado como staff con "sin propina" marcado', async () => {
    const { service, repo } = armar([
      citado(1, 'planta'),
      citado(2, 'freelance'),
    ]);
    await service.traerPlantaAlEvento('ev-1', 7);
    const filas = repo.addStaffEnLote.mock.calls[0][0];
    expect(filas).toHaveLength(2);
    const [planta, staff] = filas;
    expect(planta).toMatchObject({
      person_id: 1,
      kind: 'planta',
      solo_propina: false,
      no_tip: false,
      amount: null,
    });
    expect(staff).toMatchObject({
      person_id: 2,
      kind: 'freelance',
      solo_propina: true,
      no_tip: true,
      amount: null,
      quotation_id: 'ev-1',
    });
  });

  it('no duplica a quien ya está en el evento ese día', async () => {
    const { service, repo } = armar(
      [citado(2, 'freelance')],
      [{ id: 99, quotation_id: 'ev-1', person_id: 2, day: '2026-09-18' }],
    );
    const r = await service.traerPlantaAlEvento('ev-1', 7);
    expect(r).toEqual({ traidos: 0 });
    expect(repo.addStaffEnLote.mock.calls[0][0]).toHaveLength(0);
  });

  it('la fila solo-de-propina que trae la ficha NO cuenta como "la mandaron al evento" (la proyección no le borra el turno)', () => {
    const traida = filaTraidaAlEvento(7, 'ev-1', citado(3, 'freelance'));
    expect(laMandaronAUnEvento(traida)).toBe(false);
    // La planta puesta en un evento desde la casilla sí se fue del restaurante.
    expect(
      laMandaronAUnEvento({ quotation_id: 'ev-1', kind: 'freelance' }),
    ).toBe(true);
    expect(laMandaronAUnEvento({ quotation_id: 'ev-1', kind: 'planta' })).toBe(
      false,
    );
  });
});
