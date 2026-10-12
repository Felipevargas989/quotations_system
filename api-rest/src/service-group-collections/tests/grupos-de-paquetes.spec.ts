import { HttpException } from '@nestjs/common';
import { ServiceGroupCollectionsService } from '../service-group-collections.service';

/**
 * GRUPOS DE PAQUETES (12-10-2026, migración 120). Felipe: "mejor crear y
 * editar listas, es más fácil que una sección que se arme por el nombre del
 * paquete". Lo que cuidan estas pruebas: el nombre llega recortado y nunca
 * vacío, un nombre repetido se dice en castellano, nada de otra empresa se
 * toca ni se asigna, y sacar un paquete de su grupo es posible.
 */
const logger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
});

const armar = (repo: Record<string, jest.Mock>) => ({
  service: new ServiceGroupCollectionsService(repo as never, logger() as never),
  repo,
});

const fallo = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(HttpException);
  return e as HttpException;
};

const grupos = (...ids: number[]) =>
  jest.fn().mockResolvedValue({
    data: ids.map((id, i) => ({ id, name: `G${id}`, sort_order: i + 1 })),
    error: null,
  });

describe('Grupos de paquetes', () => {
  it('crear: recorta el nombre y lo deja al final del orden', async () => {
    const { service, repo } = armar({
      gruposDeLaEmpresa: grupos(1, 2, 3),
      crearGrupo: jest.fn().mockResolvedValue({ data: { id: 9 }, error: null }),
    });
    await service.crearGrupo('  Full day  ', 7);
    expect(repo.crearGrupo).toHaveBeenCalledWith(7, 'Full day', 4);
  });

  it('crear: un nombre vacío es 400 y no toca la base', async () => {
    const { service, repo } = armar({
      gruposDeLaEmpresa: grupos(),
      crearGrupo: jest.fn(),
    });
    const e = await fallo(service.crearGrupo('   ', 7));
    expect(e.getStatus()).toBe(400);
    expect(repo.crearGrupo).not.toHaveBeenCalled();
  });

  it('crear: un nombre repetido es 409 en castellano', async () => {
    const { service } = armar({
      gruposDeLaEmpresa: grupos(1),
      crearGrupo: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: '23505' } }),
    });
    const e = await fallo(service.crearGrupo('Full day', 7));
    expect(e.getStatus()).toBe(409);
    expect(e.message).toBe('Ya existe un grupo con ese nombre. Elige otro.');
  });

  it('renombrar un grupo ajeno o inexistente es 404', async () => {
    const { service } = armar({
      renombrarGrupo: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    const e = await fallo(service.renombrarGrupo(5, 'Otro nombre', 7));
    expect(e.getStatus()).toBe(404);
  });

  it('ordenar descarta los grupos de otra empresa', async () => {
    const { service, repo } = armar({
      gruposDeLaEmpresa: grupos(1, 2),
      ordenarGrupo: jest.fn().mockResolvedValue({ error: null }),
    });
    await service.ordenarGrupos([2, 99, 1], 7);
    expect(repo.ordenarGrupo.mock.calls).toEqual([
      [2, 7, 1],
      [1, 7, 2],
    ]);
  });

  it('borrar un grupo ajeno o inexistente es 404', async () => {
    const { service } = armar({
      borrarGrupo: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    const e = await fallo(service.borrarGrupo(5, 7));
    expect(e.getStatus()).toBe(404);
  });
});

describe('Editar un paquete ya creado', () => {
  const idsDeLaEmpresa = (propios: number[]) =>
    jest.fn().mockImplementation((_tabla: string, ids: number[]) =>
      Promise.resolve({
        data: ids.filter((id) => propios.includes(id)).map((id) => ({ id })),
        error: null,
      }),
    );

  it('moverlo a un grupo de otra empresa es 404 y no lo toca', async () => {
    const { service, repo } = armar({
      idsDeLaEmpresa: idsDeLaEmpresa([1]),
      actualizarPaquete: jest.fn(),
    });
    const e = await fallo(service.actualizar(5, { package_group_id: 99 }, 7));
    expect(e.getStatus()).toBe(404);
    expect(repo.actualizarPaquete).not.toHaveBeenCalled();
  });

  it('sacarlo de su grupo (null) no pide el candado del grupo', async () => {
    const { service, repo } = armar({
      idsDeLaEmpresa: jest.fn(),
      actualizarPaquete: jest
        .fn()
        .mockResolvedValue({ data: [{ id: 5 }], error: null }),
    });
    await service.actualizar(5, { package_group_id: null }, 7);
    expect(repo.idsDeLaEmpresa).not.toHaveBeenCalled();
    expect(repo.actualizarPaquete).toHaveBeenCalledWith(5, 7, {
      package_group_id: null,
    });
  });

  it('renombrarlo recorta el nombre; repetido es 409 en castellano', async () => {
    const { service, repo } = armar({
      actualizarPaquete: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: '23505' } }),
    });
    const e = await fallo(service.actualizar(5, { name: '  Full day  ' }, 7));
    expect(repo.actualizarPaquete).toHaveBeenCalledWith(5, 7, {
      name: 'Full day',
    });
    expect(e.getStatus()).toBe(409);
    expect(e.message).toBe('Ya existe un paquete con ese nombre. Elige otro.');
  });

  it('un paquete ajeno o inexistente es 404', async () => {
    const { service } = armar({
      actualizarPaquete: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    const e = await fallo(service.actualizar(5, { name: 'Nuevo' }, 7));
    expect(e.getStatus()).toBe(404);
  });

  it('sin nada que cambiar es 400', async () => {
    const { service } = armar({ actualizarPaquete: jest.fn() });
    const e = await fallo(service.actualizar(5, {}, 7));
    expect(e.getStatus()).toBe(400);
  });

  it('crear un paquete con un grupo ajeno es 404 y no lo crea', async () => {
    const { service, repo } = armar({
      idsDeLaEmpresa: idsDeLaEmpresa([5, 1]),
      createCollection: jest.fn(),
    });
    const e = await fallo(
      service.create(
        {
          name: 'Full day: estándar',
          items: [{ service_group_id: 5 }],
          package_group_id: 99,
        } as never,
        7,
      ),
    );
    expect(e.getStatus()).toBe(404);
    expect(repo.createCollection).not.toHaveBeenCalled();
  });
});
