import { NotFoundException } from '@nestjs/common';
import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';

// El alta de una persona en un día (16-09-2026): las tres miradas
// previas (cargo de la empresa, persona, fila dormida) salen JUNTAS.
// Medido en producción: cada viaje a Supabase puede trabarse 1 a 3 s
// cuando su región anda lenta, y en fila eran cuatro viajes.

type Diferido<T> = { promesa: Promise<T>; resolver: (v: T) => void };
const diferido = <T>(): Diferido<T> => {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => (resolver = r));
  return { promesa, resolver };
};

const PERSONA = {
  id: 11,
  company_id: 1,
  name: 'Martín',
  default_kind: 'freelance',
  default_role_id: 1,
  weekly_schedule: null,
  days_off: null,
};

const armar = (sobre: Partial<Record<string, unknown>> = {}) => {
  const repo = {
    esRecursoDeLaEmpresa: jest.fn().mockResolvedValue(true),
    esCotizacionDeLaEmpresa: jest.fn().mockResolvedValue(true),
    findOne: jest.fn().mockResolvedValue(PERSONA),
    findDormida: jest.fn().mockResolvedValue(null),
    findSillaVacia: jest.fn().mockResolvedValue(null),
    addStaff: jest.fn().mockResolvedValue({ id: 1936 }),
    updateStaff: jest.fn().mockResolvedValue({ id: 1900 }),
    ...sobre,
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new PeopleService(
    repo as unknown as PeopleRepository,
    logger as never,
  );
  return { service, repo };
};

const DTO = { person_id: 11, day: '2026-09-19', role_id: 1 };

describe('el alta de una persona hace sus miradas previas en paralelo', () => {
  it('cargo, persona y fila dormida se piden a la vez, no en fila', async () => {
    const cargo = diferido<boolean>();
    const persona = diferido<typeof PERSONA>();
    const dormida = diferido<null>();
    const { service, repo } = armar({
      esRecursoDeLaEmpresa: jest.fn().mockReturnValue(cargo.promesa),
      findOne: jest.fn().mockReturnValue(persona.promesa),
      findDormida: jest.fn().mockReturnValue(dormida.promesa),
    });
    const alta = service.addStaff(DTO, 1);
    await Promise.resolve();
    // Ninguna respondió todavía y las tres ya salieron: eso es "juntas".
    expect(repo.esRecursoDeLaEmpresa).toHaveBeenCalledTimes(1);
    expect(repo.findOne).toHaveBeenCalledWith(11, 1);
    expect(repo.findDormida).toHaveBeenCalledWith(1, 11, '2026-09-19');
    expect(repo.addStaff).not.toHaveBeenCalled();
    cargo.resolver(true);
    persona.resolver(PERSONA);
    dormida.resolver(null);
    await alta;
    expect(repo.addStaff).toHaveBeenCalledTimes(1);
  });

  it('un cargo ajeno sigue frenando el alta, sin insertar nada', async () => {
    const { service, repo } = armar({
      esRecursoDeLaEmpresa: jest.fn().mockResolvedValue(false),
    });
    await expect(service.addStaff(DTO, 1)).rejects.toThrow(NotFoundException);
    expect(repo.addStaff).not.toHaveBeenCalled();
  });

  it('la fila dormida se revive igual que antes (sin insertar una nueva)', async () => {
    const { service, repo } = armar({
      findDormida: jest
        .fn()
        .mockResolvedValue({ id: 1800, role_id: 1, ajuste: 'descansa' }),
    });
    await service.addStaff(DTO, 1);
    expect(repo.updateStaff).toHaveBeenCalledTimes(1);
    const llamadas = repo.updateStaff.mock.calls as Array<[number]>;
    expect(llamadas[0][0]).toBe(1800);
    expect(repo.addStaff).not.toHaveBeenCalled();
  });

  it('en un evento no se busca fila dormida: eso es del restaurante', async () => {
    const { service, repo } = armar();
    await service.addStaff({ ...DTO, quotation_id: 'q-1' }, 1);
    expect(repo.findDormida).not.toHaveBeenCalled();
    expect(repo.findSillaVacia).toHaveBeenCalledTimes(1);
  });
});
