import { HttpException } from '@nestjs/common';
import { ServiceGroupCollectionsService } from '../service-group-collections.service';

/**
 * EL CANDADO DE EMPRESA DE LOS PAQUETES (11-09-2026, sprint 1).
 *
 * Antes, `DELETE /service-group-collections/:id` borraba por id correlativo
 * sin mirar la empresa, y al crear un paquete se podían referenciar menús,
 * servicios y fijos del catálogo ajeno.
 */
const logger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
});

const armarBorrado = (respuesta: { data: unknown; error: unknown }) => {
  const repo = { removeCollection: jest.fn().mockResolvedValue(respuesta) };
  const service = new ServiceGroupCollectionsService(
    repo as never,
    logger() as never,
  );
  return { service, repo };
};

const armarCreacion = (idsPropios: number[]) => {
  const repo = {
    idsDeLaEmpresa: jest
      .fn()
      .mockImplementation((_tabla: string, ids: number[]) =>
        Promise.resolve({
          data: ids
            .filter((id) => idsPropios.includes(id))
            .map((id) => ({ id })),
          error: null,
        }),
      ),
    createCollection: jest
      .fn()
      .mockResolvedValue({ data: { id: 10 }, error: null }),
    createCollectionItems: jest.fn().mockResolvedValue({ error: null }),
    createCollectionServices: jest.fn().mockResolvedValue({ error: null }),
    createCollectionFixedServices: jest.fn().mockResolvedValue({ error: null }),
  };
  const service = new ServiceGroupCollectionsService(
    repo as never,
    logger() as never,
  );
  return { service, repo };
};

describe('Paquetes: candado de empresa', () => {
  it('borra pasando la empresa', async () => {
    const { service, repo } = armarBorrado({ data: [{ id: 4 }], error: null });
    await service.remove(4, 1);
    expect(repo.removeCollection).toHaveBeenCalledWith(4, 1);
  });

  it('un paquete de otra empresa es 404', async () => {
    const { service } = armarBorrado({ data: [], error: null });
    const e = await service.remove(4, 52).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
  });

  it('crea el paquete cuando todas las piezas son propias', async () => {
    const { service, repo } = armarCreacion([3]);
    await service.create(
      { name: 'Matrimonio', items: [{ service_group_id: 3 }] } as never,
      1,
    );
    expect(repo.idsDeLaEmpresa).toHaveBeenCalledWith('service_groups', [3], 1);
    expect(repo.createCollection).toHaveBeenCalled();
  });

  it('rechaza un menú de otra empresa y no crea nada', async () => {
    const { service, repo } = armarCreacion([3]);
    const e = await service
      .create(
        { name: 'Matrimonio', items: [{ service_group_id: 99 }] } as never,
        1,
      )
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
    expect(repo.createCollection).not.toHaveBeenCalled();
  });
});
