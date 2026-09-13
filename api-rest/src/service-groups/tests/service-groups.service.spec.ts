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

/**
 * BORRAR Y CREAR UN MENÚ (11-09-2026, sprint 1). Antes, `DELETE
 * /service-groups/:id` borraba por id correlativo sin mirar la empresa, y
 * al crear un menú se podían referenciar servicios del catálogo ajeno.
 */
const registro = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
});

describe('ServiceGroupsService.remove', () => {
  const armarBorrado = (respuesta: { data: unknown; error: unknown }) => {
    const repo = { removeGroup: jest.fn().mockResolvedValue(respuesta) };
    const service = new ServiceGroupsService(
      repo as never,
      registro() as never,
    );
    return { service, repo };
  };

  it('borra pasando la empresa al repositorio', async () => {
    const { service, repo } = armarBorrado({ data: [{ id: 4 }], error: null });
    await service.remove(4, 1);
    expect(repo.removeGroup).toHaveBeenCalledWith(4, 1);
  });

  it('menú de otra empresa o inexistente → 404', async () => {
    const { service } = armarBorrado({ data: [], error: null });
    const e = await service.remove(4, 52).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
  });
});

describe('ServiceGroupsService.create', () => {
  const armarCreacion = (idsPropios: number[]) => {
    const repo = {
      variableServicesDeLaEmpresa: jest
        .fn()
        .mockImplementation((ids: number[]) =>
          Promise.resolve({
            data: ids
              .filter((id) => idsPropios.includes(id))
              .map((id) => ({ id })),
            error: null,
          }),
        ),
      createGroup: jest
        .fn()
        .mockResolvedValue({ data: { id: 9 }, error: null }),
      createGroupItems: jest.fn().mockResolvedValue({ error: null }),
    };
    const service = new ServiceGroupsService(
      repo as never,
      registro() as never,
    );
    return { service, repo };
  };

  it('crea el menú cuando los servicios son del catálogo propio', async () => {
    const { service, repo } = armarCreacion([5]);
    await service.create(
      {
        name: 'Coffee',
        items: [{ variable_service_id: 5, quantity: 2 }],
      } as never,
      1,
    );
    expect(repo.variableServicesDeLaEmpresa).toHaveBeenCalledWith([5], 1);
    expect(repo.createGroup).toHaveBeenCalled();
  });

  it('rechaza un servicio de otra empresa y no crea el menú', async () => {
    const { service, repo } = armarCreacion([5]);
    const e = await service
      .create(
        {
          name: 'Coffee',
          items: [{ variable_service_id: 99, quantity: 1 }],
        } as never,
        1,
      )
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(404);
    expect(repo.createGroup).not.toHaveBeenCalled();
  });
});
