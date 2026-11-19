import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';

// EL PUESTO VACÍO VALE LO QUE VALE SU CARGO (Felipe, 04-11-2026, la 522):
// la grilla de Gestión mostraba «Valor c/u $28.000» y el subtotal sumaba
// en $0 las sillas puestas antes de que el cargo tuviera valor. Ahora una
// silla vacía sin monto toma el valor de su cargo: al nacer y cuando el
// cargo recibe valor por cualquier puerta.
const EVENTO = 'cc78c09a-71a8-4bed-86c1-df9f270370ec';

const armar = (fila: Record<string, unknown>, valorDelCargo = 28000) => {
  const repo = {
    findStaffPorId: jest.fn().mockResolvedValue(fila),
    updateStaff: jest.fn().mockResolvedValue(fila),
    addStaff: jest.fn().mockImplementation((r) => Promise.resolve(r)),
    valorDelCargo: jest.fn().mockResolvedValue(valorDelCargo),
    valorizarVaciasSinMonto: jest.fn().mockResolvedValue(undefined),
    esCotizacionDeLaEmpresa: jest.fn().mockResolvedValue(true),
    esRecursoDeLaEmpresa: jest.fn().mockResolvedValue(true),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new PeopleService(
    repo as unknown as PeopleRepository,
    logger as never,
  );
  return { repo, service };
};

describe('el puesto vacío vale lo que vale su cargo (04-11)', () => {
  it('el monto de una persona en Planificación valoriza las sillas sin monto de su cargo', async () => {
    const { repo, service } = armar({
      quotation_id: EVENTO,
      role_id: 1,
      kind: 'freelance',
      person_id: 7,
      amount: 28000,
    });
    await service.updateStaff(2639, { amount: 28000 }, 1);
    expect(repo.valorizarVaciasSinMonto).toHaveBeenCalledWith(
      1,
      EVENTO,
      1,
      28000,
    );
  });

  it('cambiar solo el horario no toca el valor del cargo', async () => {
    const { repo, service } = armar({
      quotation_id: EVENTO,
      role_id: 1,
      kind: 'freelance',
      amount: 28000,
    });
    await service.updateStaff(2639, { starts_at: '10:00' } as never, 1);
    expect(repo.valorizarVaciasSinMonto).not.toHaveBeenCalled();
  });

  it('la asignación extra de la planta no es el precio de un cargo', async () => {
    const { repo, service } = armar({
      quotation_id: EVENTO,
      role_id: 1,
      kind: 'planta',
      amount: 10000,
    });
    await service.updateStaff(2639, { amount: 10000 }, 1);
    expect(repo.valorizarVaciasSinMonto).not.toHaveBeenCalled();
  });

  it('un día de staff (sin evento) no valoriza nada', async () => {
    const { repo, service } = armar({
      quotation_id: null,
      role_id: 1,
      kind: 'freelance',
      amount: 28000,
    });
    await service.updateStaff(2639, { amount: 28000 }, 1);
    expect(repo.valorizarVaciasSinMonto).not.toHaveBeenCalled();
  });

  it('una silla nueva sin valor nace con el de su cargo', async () => {
    const { repo, service } = armar({}, 25000);
    const silla = await service.addStaff(
      { quotation_id: EVENTO, role_id: 33, day: '2026-11-05' } as never,
      1,
    );
    expect(repo.valorDelCargo).toHaveBeenCalledWith(1, EVENTO, 33);
    expect((silla as { amount: number }).amount).toBe(25000);
  });

  it('una silla nueva con valor lo conserva y se lo da a las sin monto', async () => {
    const { repo, service } = armar({}, 25000);
    await service.addStaff(
      {
        quotation_id: EVENTO,
        role_id: 1,
        day: '2026-11-05',
        amount: 28000,
      } as never,
      1,
    );
    expect(repo.valorDelCargo).not.toHaveBeenCalled();
    expect(repo.addStaff).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 28000 }),
    );
    expect(repo.valorizarVaciasSinMonto).toHaveBeenCalledWith(
      1,
      EVENTO,
      1,
      28000,
    );
  });

  it('si el cargo todavía no tiene valor, la silla nace sin monto', async () => {
    const { repo, service } = armar({}, null as never);
    const silla = await service.addStaff(
      { quotation_id: EVENTO, role_id: 1, day: '2026-11-05' } as never,
      1,
    );
    expect((silla as { amount: number | null }).amount).toBeNull();
    expect(repo.valorizarVaciasSinMonto).not.toHaveBeenCalled();
  });
});
