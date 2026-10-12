import { HttpException } from '@nestjs/common';
import { ServiceGroupsService } from '../service-groups.service';

/**
 * GRUPOS DE MENÚS GUARDADOS (12-10-2026, migración 121). Felipe: "así
 * podemos ordenar también los menús guardados de cada categoría". Las
 * reglas son las mismas de los paquetes (src/grupos-de-lista); acá se
 * cuida lo propio de los menús: cada categoría con sus grupos, y un menú
 * solo puede ir a un grupo de SU categoría.
 */
const logger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
});

const armar = (repo: Record<string, jest.Mock>) => ({
  service: new ServiceGroupsService(repo as never, logger() as never),
  repo,
});

const fallo = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(HttpException);
  return e as HttpException;
};

const responde = (data: unknown) =>
  jest.fn().mockResolvedValue({ data, error: null });

describe('Grupos de menús guardados', () => {
  it('crear: el grupo nace en SU categoría y al final de ese orden', async () => {
    const { service, repo } = armar({
      gruposDeMenus: responde([
        { id: 1, name: 'Nivel 1', sort_order: 1 },
        { id: 2, name: 'Nivel 2', sort_order: 2 },
      ]),
      crearGrupoDeMenus: responde({ id: 3 }),
    });
    await service.crearGrupo('Almuerzo', '  Nivel 3 ', 7);
    expect(repo.gruposDeMenus).toHaveBeenCalledWith(7, 'Almuerzo');
    expect(repo.crearGrupoDeMenus).toHaveBeenCalledWith(
      7,
      'Almuerzo',
      'Nivel 3',
      3,
    );
  });

  it('crear sin categoría es 400 y no toca la base', async () => {
    const { service, repo } = armar({ crearGrupoDeMenus: jest.fn() });
    const e = await fallo(service.crearGrupo('  ', 'Nivel 1', 7));
    expect(e.getStatus()).toBe(400);
    expect(repo.crearGrupoDeMenus).not.toHaveBeenCalled();
  });

  it('crear un nombre repetido en la categoría es 409 en castellano', async () => {
    const { service } = armar({
      gruposDeMenus: responde([]),
      crearGrupoDeMenus: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: '23505' } }),
    });
    const e = await fallo(service.crearGrupo('Almuerzo', 'Nivel 1', 7));
    expect(e.getStatus()).toBe(409);
    expect(e.message).toBe('Ya existe un grupo con ese nombre. Elige otro.');
  });

  it('ordenar descarta los grupos de otra categoría o empresa', async () => {
    const { service, repo } = armar({
      gruposDeMenus: responde([
        { id: 1, name: 'Nivel 1', sort_order: 1 },
        { id: 2, name: 'Nivel 2', sort_order: 2 },
      ]),
      ordenarGrupoDeMenus: jest.fn().mockResolvedValue({ error: null }),
    });
    await service.ordenarGrupos('Almuerzo', [2, 50, 1], 7);
    expect(repo.ordenarGrupoDeMenus.mock.calls).toEqual([
      [2, 7, 1],
      [1, 7, 2],
    ]);
  });

  it('borrar un grupo ajeno es 404', async () => {
    const { service } = armar({ borrarGrupoDeMenus: responde([]) });
    const e = await fallo(service.borrarGrupo(9, 7));
    expect(e.getStatus()).toBe(404);
  });
});

describe('Cambiar un menú de grupo', () => {
  it('un grupo de OTRA categoría es 400 y no toca el menú', async () => {
    const { service, repo } = armar({
      categoriaDelMenu: responde([{ id: 5, category: 'Almuerzo' }]),
      categoriaDelGrupoDeMenus: responde([{ id: 9, category: 'Desayuno' }]),
      asignarGrupoAlMenu: jest.fn(),
    });
    const e = await fallo(service.asignarGrupo(5, 9, 7));
    expect(e.getStatus()).toBe(400);
    expect(repo.asignarGrupoAlMenu).not.toHaveBeenCalled();
  });

  it('un grupo ajeno o inexistente es 404', async () => {
    const { service, repo } = armar({
      categoriaDelMenu: responde([{ id: 5, category: 'Almuerzo' }]),
      categoriaDelGrupoDeMenus: responde([]),
      asignarGrupoAlMenu: jest.fn(),
    });
    const e = await fallo(service.asignarGrupo(5, 9, 7));
    expect(e.getStatus()).toBe(404);
    expect(repo.asignarGrupoAlMenu).not.toHaveBeenCalled();
  });

  it('un menú ajeno es 404', async () => {
    const { service } = armar({ categoriaDelMenu: responde([]) });
    const e = await fallo(service.asignarGrupo(5, null, 7));
    expect(e.getStatus()).toBe(404);
  });

  it('a un grupo de su categoría, se guarda', async () => {
    const { service, repo } = armar({
      categoriaDelMenu: responde([{ id: 5, category: 'Almuerzo' }]),
      categoriaDelGrupoDeMenus: responde([{ id: 9, category: 'Almuerzo' }]),
      asignarGrupoAlMenu: responde([{ id: 5, name: 'X', menu_group_id: 9 }]),
    });
    await service.asignarGrupo(5, 9, 7);
    expect(repo.asignarGrupoAlMenu).toHaveBeenCalledWith(5, 7, 9);
  });

  it('sacarlo de su grupo (null) no pide el grupo', async () => {
    const { service, repo } = armar({
      categoriaDelMenu: responde([{ id: 5, category: 'Almuerzo' }]),
      categoriaDelGrupoDeMenus: jest.fn(),
      asignarGrupoAlMenu: responde([{ id: 5, name: 'X', menu_group_id: null }]),
    });
    await service.asignarGrupo(5, null, 7);
    expect(repo.categoriaDelGrupoDeMenus).not.toHaveBeenCalled();
    expect(repo.asignarGrupoAlMenu).toHaveBeenCalledWith(5, 7, null);
  });
});
