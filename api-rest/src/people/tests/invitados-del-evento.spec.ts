import { BadRequestException } from '@nestjs/common';
import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';

/**
 * LOS INVITADOS DEL EVENTO AL POZO DEL DÍA (Felipe, 24-08): "un garzón
 * que viene a un evento, si llegan un par de mesas, puede atenderlas —
 * son dos propinas distintas". La planificación no se toca; al repartir
 * el día, el incluido recibe una fila solo-de-propina con el mismo
 * horario del evento y sin pago de jornada.
 */
const POZO = {
  id: 9,
  quotation_id: null,
  day: '2026-08-14',
  first_amount: 10_000,
  second_amount: 0,
};

const filaEvento = (id: number, personId: number) => ({
  id,
  quotation_id: 'ev-1',
  person_id: personId,
  day: '2026-08-14',
  role_id: 2,
  kind: 'freelance',
  starts_at: '12:00',
  ends_at: '21:00',
  break_minutes: 0,
  tip_payroll_id: null,
});

const armar = (opciones: {
  delDia: unknown[];
  porId?: Record<number, unknown>;
}) => {
  const repo = {
    findPool: jest.fn().mockResolvedValue(POZO),
    findPlantaDelDia: jest.fn().mockResolvedValue(opciones.delDia),
    findStaffPorId: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(opciones.porId?.[id] ?? null),
      ),
    addStaffEnLote: jest.fn().mockResolvedValue(0),
    removeStaffEnLote: jest.fn().mockResolvedValue(0),
    updateStaff: jest.fn().mockResolvedValue({}),
    updatePool: jest.fn().mockResolvedValue({}),
    clearTips: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new PeopleService(
    repo as unknown as PeopleRepository,
    logger as never,
  );
  return { service, repo };
};

const PCTS = { porcentajes: [{ role_id: 2, pct: 100 }] };

describe('repartir un día con invitados del evento', () => {
  it('crea la fila solo-de-propina con el horario del evento y sin pago', async () => {
    const planta = {
      id: 50,
      person_id: 7,
      role_id: 2,
      solo_propina: false,
      no_tip: false,
      tip_payroll_id: null,
      starts_at: '10:00',
      ends_at: '19:00',
      break_minutes: 60,
    };
    const { service, repo } = armar({
      delDia: [planta],
      porId: { 101: filaEvento(101, 8) },
    });
    await service.repartir(9, { ...PCTS, invitados: [101] }, 1);
    expect(repo.addStaffEnLote).toHaveBeenCalledWith([
      expect.objectContaining({
        person_id: 8,
        quotation_id: null,
        day: '2026-08-14',
        solo_propina: true,
        amount: null,
        starts_at: '12:00',
        ends_at: '21:00',
        role_id: 2,
      }),
    ]);
  });

  it('volver a repartir sin el invitado borra su fila solo-de-propina', async () => {
    const solo = {
      id: 60,
      person_id: 8,
      role_id: 2,
      solo_propina: true,
      no_tip: false,
      tip_payroll_id: null,
      starts_at: '12:00',
      ends_at: '21:00',
      break_minutes: 0,
    };
    const planta = {
      id: 50,
      person_id: 7,
      role_id: 2,
      solo_propina: false,
      no_tip: false,
      tip_payroll_id: null,
      starts_at: '10:00',
      ends_at: '19:00',
      break_minutes: 60,
    };
    const { service, repo } = armar({ delDia: [solo, planta] });
    await service.repartir(9, { ...PCTS, invitados: [] }, 1);
    expect(repo.removeStaffEnLote).toHaveBeenCalledWith([60], 1);
    expect(repo.addStaffEnLote).toHaveBeenCalledWith([]);
  });

  it('el chip o el extra crean la fila solo-de-propina si no existe', async () => {
    const { service, repo } = armar({
      delDia: [],
      porId: { 101: filaEvento(101, 8) },
    });
    await service.soloPropinaDelDia({ evento_staff_id: 101, no_tip: true }, 1);
    expect(repo.addStaffEnLote).toHaveBeenCalledWith([
      expect.objectContaining({
        person_id: 8,
        solo_propina: true,
        no_tip: true,
        amount: null,
        starts_at: '12:00',
      }),
    ]);
  });

  it('si la fila ya existe, el chip y el extra solo la corrigen', async () => {
    const solo = {
      id: 60,
      person_id: 8,
      solo_propina: true,
      no_tip: false,
      tip_payroll_id: null,
    };
    const { service, repo } = armar({
      delDia: [solo],
      porId: { 101: filaEvento(101, 8) },
    });
    await service.soloPropinaDelDia(
      { evento_staff_id: 101, amount: 15_000 },
      1,
    );
    expect(repo.updateStaff).toHaveBeenCalledWith(60, { amount: 15_000 }, 1);
    expect(repo.addStaffEnLote).not.toHaveBeenCalled();
  });

  it('un invitado de otro día es un error', async () => {
    const otroDia = { ...filaEvento(102, 9), day: '2026-08-15' };
    const { service } = armar({ delDia: [], porId: { 102: otroDia } });
    await expect(
      service.repartir(9, { ...PCTS, invitados: [102] }, 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('una jornada que no es de evento no puede ser invitada', async () => {
    const dePlanta = { ...filaEvento(103, 9), quotation_id: null };
    const { service } = armar({ delDia: [], porId: { 103: dePlanta } });
    await expect(
      service.repartir(9, { ...PCTS, invitados: [103] }, 1),
    ).rejects.toThrow(BadRequestException);
  });
});
