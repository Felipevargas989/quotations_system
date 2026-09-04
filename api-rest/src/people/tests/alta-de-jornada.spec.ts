import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';
import { cambiosParaRevivir } from '../utils/alta-de-jornada';

// La pregunta del día extra (04-09, capítulo 11). El monto ya no se
// exige en el alta (segunda vuelta del mismo día): el freelance del
// restaurante nace por confirmar y el candado del 15-08 —sin monto no
// se confirma— hace el resto. Ese candado carga toda la regla, así que
// acá tiene su prueba.
const armar = (filaActual: unknown) => {
  const repo = {
    findStaffPorId: jest.fn().mockResolvedValue(filaActual),
    updateStaff: jest.fn().mockResolvedValue({}),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  return new PeopleService(
    repo as unknown as PeopleRepository,
    logger as never,
  );
};

describe('la pregunta del día extra (04-09)', () => {
  it('el candado del 15-08: un freelance sin monto no se confirma', async () => {
    const service = armar({ kind: 'freelance', amount: null });
    await expect(
      service.updateStaff(1716, { status: 'confirmado' }, 1),
    ).rejects.toThrow('Ponle el monto del día antes de confirmarla');
  });

  it('con monto sí se confirma; la planta no lo necesita', async () => {
    await expect(
      armar({ kind: 'freelance', amount: 30000 }).updateStaff(
        1,
        { status: 'confirmado' },
        1,
      ),
    ).resolves.toBeDefined();
    await expect(
      armar({ kind: 'planta', amount: null }).updateStaff(
        2,
        { status: 'confirmado' },
        1,
      ),
    ).resolves.toBeDefined();
  });

  const armarSacar = (fila: Record<string, unknown>) => {
    const repo = {
      findStaffRow: jest.fn().mockResolvedValue({
        quotation_id: null,
        person_id: 7,
        payroll_id: null,
        tip_payroll_id: null,
        tip_amount: null,
        tip_pool_id: null,
        ...fila,
      }),
      updateStaff: jest.fn().mockResolvedValue({}),
      removeStaff: jest.fn().mockResolvedValue({}),
    };
    const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const service = new PeopleService(
      repo as unknown as PeopleRepository,
      logger as never,
    );
    return { service, repo };
  };

  it('sacar un día de patrón del restaurante lo DUERME, no lo borra', async () => {
    const { service, repo } = armarSacar({ kind: 'planta', ajuste: null });
    await service.removeStaff(1, 1);
    expect(repo.updateStaff).toHaveBeenCalledWith(1, { ajuste: 'descansa' }, 1);
    expect(repo.removeStaff).not.toHaveBeenCalled();
  });

  it("el día agregado a mano ('trabaja') y el freelance sí se borran", async () => {
    const conTrabaja = armarSacar({ kind: 'planta', ajuste: 'trabaja' });
    await conTrabaja.service.removeStaff(2, 1);
    expect(conTrabaja.repo.removeStaff).toHaveBeenCalledWith(2, 1);

    const freelance = armarSacar({ kind: 'freelance', ajuste: null });
    await freelance.service.removeStaff(3, 1);
    expect(freelance.repo.removeStaff).toHaveBeenCalledWith(3, 1);
  });

  it('revivir como planta: sin monto y confirmada (es su jornada)', () => {
    const c = cambiosParaRevivir({ kind: 'planta', amount: 99000 });
    expect(c.amount).toBeNull();
    expect(c.status).toBe('confirmado');
    expect(c.ajuste).toBeNull();
  });

  it('revivir como freelance: por confirmar, monto si lo trae', () => {
    const c = cambiosParaRevivir({ kind: 'freelance', amount: 30000 });
    expect(c.amount).toBe(30000);
    expect(c.status).toBe('por_confirmar');
    const sinMonto = cambiosParaRevivir({ kind: 'freelance' });
    expect(sinMonto.amount).toBeNull();
    expect(sinMonto.status).toBe('por_confirmar');
  });
});
