import { BadRequestException } from '@nestjs/common';
import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';

/**
 * REABRIR UNA LIQUIDACIÓN (Felipe, 18-08): "que elimine la liquidación
 * por pagar y la regrese a liquidaciones para liquidarlo otra vez".
 *
 * La regla de fierro es una sola y es la que este archivo fija: se
 * reabre SOLO si nada de esa liquidación entró ya a una nómina. Lo
 * pagado no se deshace.
 */
const armar = (hayPagos: boolean) => {
  const repo = {
    esCotizacionDeLaEmpresa: jest.fn().mockResolvedValue(true),
    hayPagosEn: jest.fn().mockResolvedValue(hayPagos),
    upsertSheet: jest.fn().mockResolvedValue({}),
    desrepartirPozoDelDia: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const service = new PeopleService(
    repo as unknown as PeopleRepository,
    logger as never,
  );
  return { service, repo };
};

describe('reabrirLiquidacion', () => {
  it('un evento sin pagos vuelve de ficha cerrada a "trabajado"', async () => {
    const { service, repo } = armar(false);
    const r = await service.reabrirLiquidacion(
      { quotation_id: '11111111-1111-1111-1111-111111111111' },
      1,
    );
    expect(r).toEqual({
      reabierto: 'evento',
      quotation_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(repo.upsertSheet).toHaveBeenCalledWith(
      1,
      '11111111-1111-1111-1111-111111111111',
      { status: 'trabajado', closed_at: null },
    );
    expect(repo.desrepartirPozoDelDia).not.toHaveBeenCalled();
  });

  it('un día de restaurante sin pagos vuelve a pozo sin repartir', async () => {
    const { service, repo } = armar(false);
    const r = await service.reabrirLiquidacion({ day: '2026-08-18' }, 1);
    expect(r).toEqual({ reabierto: 'dia', day: '2026-08-18' });
    expect(repo.desrepartirPozoDelDia).toHaveBeenCalledWith(1, '2026-08-18');
    expect(repo.upsertSheet).not.toHaveBeenCalled();
  });

  it('REGLA DE FIERRO: con algo ya en una nómina, no se reabre nada', async () => {
    const { service, repo } = armar(true);
    await expect(
      service.reabrirLiquidacion(
        { quotation_id: '11111111-1111-1111-1111-111111111111' },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reabrirLiquidacion({ day: '2026-08-18' }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.upsertSheet).not.toHaveBeenCalled();
    expect(repo.desrepartirPozoDelDia).not.toHaveBeenCalled();
  });

  it('sin evento ni día no hay nada que reabrir', async () => {
    const { service } = armar(false);
    await expect(service.reabrirLiquidacion({}, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
