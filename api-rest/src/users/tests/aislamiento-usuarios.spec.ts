import { NotFoundException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { UsersService } from '../users.service';

/**
 * VER Y EDITAR SOLO USUARIOS DE LA PROPIA EMPRESA (14-09-2026, paso 2).
 * `AuthGuard` sigue usando `findOne` sin empresa para poblar la sesión;
 * las puertas GET y PATCH /users/:id usan estas variantes con empresa.
 */
const armar = (perfil: Record<string, unknown> | null, editado = true) => {
  const repo = {
    findOne: jest.fn().mockResolvedValue({ data: perfil, error: null }),
    update: jest.fn().mockResolvedValue({
      data: editado ? { id: 'u-2', full_name: 'Ana' } : null,
      error: editado ? null : { code: 'PGRST116' },
    }),
  };
  // Orden real del constructor: repositorio, logger, super-admin.
  const service = new UsersService(
    repo as never,
    mockPinoLogger() as never,
    {} as never,
  );
  return { service, repo };
};

describe('Usuarios: candado de empresa', () => {
  it('ver un perfil propio de la empresa', async () => {
    const { service } = armar({ id: 'u-2', company_id: 1 });
    const r = await service.findOneDeLaEmpresa('u-2', 1);
    expect(r.data).toMatchObject({ id: 'u-2' });
  });

  it('ver un perfil de otra empresa es 404', async () => {
    const { service } = armar({ id: 'u-9', company_id: 52 });
    await expect(service.findOneDeLaEmpresa('u-9', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('editar pasa la empresa al repositorio', async () => {
    const { service, repo } = armar(null, true);
    await service.update('u-2', { full_name: 'Ana' } as never, 1);
    expect(repo.update).toHaveBeenCalledWith('u-2', { full_name: 'Ana' }, 1);
  });

  it('editar un perfil ajeno no toca ninguna fila y es 404', async () => {
    const { service } = armar(null, false);
    await expect(
      service.update('u-9', { full_name: 'X' } as never, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
