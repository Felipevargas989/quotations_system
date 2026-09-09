import { HttpException } from '@nestjs/common';
import { ServiceGroupsService } from '../service-groups.service';

/**
 * RENOMBRAR UN MENÚ GUARDADO (Felipe, 09-09: "un lápiz al lado del
 * basurero para editar el nombre"). Lo que importa: el candado de
 * empresa viaja al repositorio, un nombre repetido se dice en
 * castellano, y un menú ajeno o inexistente es 404.
 */
const armar = (respuesta: { data: unknown; error: unknown }) => {
  const repo = {
    renameGroup: jest.fn().mockResolvedValue(respuesta),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
  const service = new ServiceGroupsService(repo as never, logger as never);
  return { service, repo };
};

describe('ServiceGroupsService.rename', () => {
  it('recorta el nombre y pasa la empresa al repositorio', async () => {
    const { service, repo } = armar({
      data: { id: 7, name: 'Coffee Ejecutivo' },
      error: null,
    });
    const r = await service.rename(7, 1, '  Coffee Ejecutivo  ');
    expect(repo.renameGroup).toHaveBeenCalledWith(7, 1, 'Coffee Ejecutivo');
    expect(r).toEqual({ id: 7, name: 'Coffee Ejecutivo' });
  });

  it('nombre repetido → 409 con mensaje en castellano', async () => {
    const { service } = armar({ data: null, error: { code: '23505' } });
    await expect(service.rename(7, 1, 'Coffee Clásico')).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe un menú guardado con ese nombre. Elige otro.',
    });
  });

  it('menú ajeno o inexistente → 404', async () => {
    const { service } = armar({ data: null, error: { code: 'PGRST116' } });
    const e = await service.rename(99, 1, 'Otro').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
  });
});
