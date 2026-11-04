import { PinoLogger } from 'nestjs-pino';
import { cachePerfiles } from 'src/cache/memoria';
import { SuperAdminService } from 'src/super-admin/super-admin.service';
import { mockPinoLogger } from '../../testing/mocks';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

// 03-11-2026: Cotota pasó de vendedor a operaciones y el motor le siguió
// negando los respaldos una hora, porque editar no olvidaba el perfil.
// La memoria va por el id de Auth (user_id), no por el id del perfil.
describe('UsersService: el cargo nuevo rige al instante', () => {
  const perfil = { id: 'perfil-1', user_id: 'auth-1', role: 'operaciones' };

  const servicio = (repo: Partial<UsersRepository>) =>
    new UsersService(
      repo as UsersRepository,
      mockPinoLogger() as unknown as PinoLogger,
      {} as SuperAdminService,
    );

  beforeEach(() => cachePerfiles.set('auth-1', { role: 'vendedor' }, 60_000));

  it('al editar, olvida el perfil guardado por su id de Auth', async () => {
    const repo = {
      update: jest.fn().mockResolvedValue({ data: perfil, error: null }),
    };
    await servicio(repo).update(
      'perfil-1',
      { role: 'operaciones' } as never,
      1,
    );
    expect(cachePerfiles.get('auth-1')).toBeUndefined();
  });

  it('al eliminar, olvida el perfil guardado por su id de Auth', async () => {
    const repo = {
      remove: jest.fn().mockResolvedValue({ data: perfil, error: null }),
      removeAuthUser: jest.fn().mockResolvedValue({ error: null }),
    };
    await servicio(repo).remove('perfil-1', 1);
    expect(cachePerfiles.get('auth-1')).toBeUndefined();
  });

  it('si la edición falla, no toca la memoria', async () => {
    const repo = {
      update: jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'x' } }),
    };
    await expect(
      servicio(repo).update('perfil-1', { role: 'operaciones' } as never, 1),
    ).rejects.toThrow();
    expect(cachePerfiles.get('auth-1')).toEqual({ role: 'vendedor' });
  });
});
