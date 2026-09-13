import { HttpException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { ServicesService } from '../services.service';

/**
 * EL CANDADO DE EMPRESA DEL CATÁLOGO (11-09-2026, sprint 1).
 *
 * Los id de `variable_services` y `fixed_services` son correlativos: sin
 * filtro de empresa, un administrador de otra empresa editaba el catálogo
 * ajeno probando números. Lo que importa: la empresa viaja al repositorio,
 * sin fila tocada es 404, y un servicio ajeno no llega nunca a la parte
 * que reordena sus categorías.
 */
const armar = (respuesta: { data: unknown; error: unknown }) => {
  const repo = {
    updateFixedService: jest.fn().mockResolvedValue(respuesta),
    updateVariableService: jest.fn().mockResolvedValue(respuesta),
    getLinksForService: jest.fn().mockResolvedValue({ data: [], error: null }),
    deleteServiceCategoryLink: jest.fn().mockResolvedValue({ error: null }),
    getMaxServiceSortOrder: jest.fn().mockResolvedValue(0),
    insertServiceCategoryLink: jest.fn().mockResolvedValue({ error: null }),
  };
  const service = new ServicesService(repo as never, mockPinoLogger() as never);
  return { service, repo };
};

describe('Catálogo: candado de empresa', () => {
  it('el servicio fijo se edita con la empresa de quien pide', async () => {
    const { service, repo } = armar({ data: [{ id: 7 }], error: null });
    await service.updateFixedService(7, { is_active: false } as never, 1);
    expect(repo.updateFixedService).toHaveBeenCalledWith(
      7,
      { is_active: false },
      1,
    );
  });

  it('un servicio fijo de otra empresa es 404', async () => {
    const { service } = armar({ data: [], error: null });
    const e = await service
      .updateFixedService(7, { is_active: false } as never, 52)
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
  });

  it('un servicio variable ajeno es 404 y no se le tocan las categorías', async () => {
    const { service, repo } = armar({ data: [], error: null });
    const e = await service
      .updateVariableService(9, { category_ids: [3] } as never, 52)
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
    expect(repo.getLinksForService).not.toHaveBeenCalled();
    expect(repo.deleteServiceCategoryLink).not.toHaveBeenCalled();
  });

  it('las categorías de un servicio propio se leen con la empresa', async () => {
    const { service, repo } = armar({ data: [{ id: 9 }], error: null });
    await service.updateVariableService(9, { category_ids: [3] } as never, 1);
    expect(repo.updateVariableService).toHaveBeenCalledWith(9, {}, 1);
    expect(repo.getLinksForService).toHaveBeenCalledWith(9, 1);
  });
});
