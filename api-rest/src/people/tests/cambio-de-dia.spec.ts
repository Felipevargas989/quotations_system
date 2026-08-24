import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';

/**
 * EL CAMBIO DE DÍA DE LA PLANTA (Felipe, 24-08, migración 89): Soledad
 * libra domingo y lunes; se le cambió el 23-24 (trabaja) por el 25-26
 * (descansa). La proyección anual NO puede deshacer el cambio: ni
 * borrar el día agregado, ni recrear el quitado.
 */
const PERSONA = {
  id: 7,
  status: 'activa',
  default_kind: 'planta',
  default_role_id: 3,
  days_off: [0, 1], // libra domingo y lunes
  weekly_schedule: {
    '2': { in: '08:00', out: '17:00' },
    '3': { in: '08:00', out: '17:00' },
    '4': { in: '08:00', out: '17:00' },
    '5': { in: '08:00', out: '17:00' },
    '6': { in: '08:00', out: '17:00' },
  },
};

const armar = (suyas: unknown[]) => {
  const repo = {
    findOne: jest.fn().mockResolvedValue(PERSONA),
    findDePersonaDesde: jest.fn().mockResolvedValue(suyas),
    addStaffEnLote: jest.fn().mockResolvedValue(0),
    removeStaffEnLote: jest.fn().mockResolvedValue(0),
    updateStaff: jest.fn().mockResolvedValue({}),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new PeopleService(
    repo as unknown as PeopleRepository,
    logger as never,
  );
  return { service, repo };
};

// Un domingo futuro fijo relativo a hoy: la proyección parte de hoy, así
// que armamos los días sobre fechas que seguro están en la ventana.
const HOY = new Date().toLocaleDateString('en-CA', {
  timeZone: 'America/Santiago',
});
const domingoFuturo = () => {
  const d = new Date(`${HOY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
};
const DOMINGO = domingoFuturo(); // día libre según patrón
const MARTES = (() => {
  const d = new Date(`${DOMINGO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
})(); // día de trabajo según patrón

describe('proyectarPlanta con cambio de día', () => {
  it("no borra el día agregado a mano ('trabaja') en su día libre", async () => {
    const { service, repo } = armar([
      {
        id: 90,
        quotation_id: null,
        day: DOMINGO,
        kind: 'planta',
        amount: null,
        tip_amount: null,
        payroll_id: null,
        tip_payroll_id: null,
        ajuste: 'trabaja',
        starts_at: '09:00',
        ends_at: '19:00',
        break_minutes: 60,
        role_id: 3,
      },
    ]);
    await service.proyectarPlanta(1, 7);
    expect(repo.removeStaffEnLote).toHaveBeenCalledWith([], 1);
  });

  it("no recrea ni corrige el día quitado ('descansa') en su día de trabajo", async () => {
    const { service, repo } = armar([
      {
        id: 91,
        quotation_id: null,
        day: MARTES,
        kind: 'planta',
        amount: null,
        tip_amount: null,
        payroll_id: null,
        tip_payroll_id: null,
        ajuste: 'descansa',
        starts_at: '08:00',
        ends_at: '17:00',
        break_minutes: 60,
        role_id: 3,
      },
    ]);
    await service.proyectarPlanta(1, 7);
    const creados = (repo.addStaffEnLote.mock.calls[0]?.[0] ?? []) as {
      day: string;
    }[];
    expect(creados.some((f) => f.day === MARTES)).toBe(false);
    expect(repo.updateStaff).not.toHaveBeenCalled();
  });

  it('sin ajuste, la proyección sigue mandando: quita el domingo que puso la máquina', async () => {
    const { service, repo } = armar([
      {
        id: 92,
        quotation_id: null,
        day: DOMINGO,
        kind: 'planta',
        amount: null,
        tip_amount: null,
        payroll_id: null,
        tip_payroll_id: null,
        ajuste: null,
        starts_at: '09:00',
        ends_at: '19:00',
        break_minutes: 60,
        role_id: 3,
      },
    ]);
    await service.proyectarPlanta(1, 7);
    expect(repo.removeStaffEnLote).toHaveBeenCalledWith([92], 1);
  });
});
