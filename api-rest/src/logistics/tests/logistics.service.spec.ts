import { ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from '../../testing/mocks';
import { LogisticsRepository } from '../logistics.repository';
import { LogisticsService } from '../logistics.service';

// Mudanza #2 (proveedores): pruebas del servicio nuevo.
describe('LogisticsService', () => {
  const armar = (
    usage: Record<number, { supplies: number; resources: number }>,
  ) => {
    const repo = {
      findAllSuppliers: jest.fn().mockResolvedValue([]),
      suppliersUsage: jest.fn().mockResolvedValue(usage),
      createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
      deleteSupplier: jest.fn().mockResolvedValue({ deleted: true }),
    } as unknown as LogisticsRepository;
    return {
      repo,
      service: new LogisticsService(
        repo,
        mockPinoLogger() as unknown as PinoLogger,
      ),
    };
  };

  it('should be defined', () => {
    expect(armar({}).service).toBeDefined();
  });

  it('un proveedor SIN referencias se puede eliminar', async () => {
    const { service, repo } = armar({});
    await service.deleteSupplier(1, 7);
    expect(repo.deleteSupplier).toHaveBeenCalledWith(1, 7);
  });

  it('un proveedor CON insumos apuntándole NO se elimina', async () => {
    const { service, repo } = armar({ 7: { supplies: 3, resources: 0 } });
    await expect(service.deleteSupplier(1, 7)).rejects.toThrow(
      ConflictException,
    );
    expect(repo.deleteSupplier).not.toHaveBeenCalled();
  });

  it('un proveedor CON recursos apuntándole NO se elimina', async () => {
    const { service, repo } = armar({ 7: { supplies: 0, resources: 1 } });
    await expect(service.deleteSupplier(1, 7)).rejects.toThrow(
      ConflictException,
    );
    expect(repo.deleteSupplier).not.toHaveBeenCalled();
  });
});
