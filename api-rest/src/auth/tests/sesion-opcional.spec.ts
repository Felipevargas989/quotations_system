import { UnauthorizedException } from '@nestjs/common';
import { cachePerfiles } from 'src/cache/memoria';
import { UsersRepository } from 'src/users/users.repository';
import { AuthService } from '../auth.service';
import { SesionOpcional } from '../sesion-opcional.service';

// La sesión opcional de una puerta pública (17-10-2026): lee el pase si
// viene, y nunca rechaza. Sin pase, o con uno que no vale, es "sin sesión".
describe('SesionOpcional', () => {
  const armar = (validateToken: jest.Mock, findOne: jest.Mock = jest.fn()) =>
    new SesionOpcional(
      { validateToken } as unknown as AuthService,
      { findOne } as unknown as UsersRepository,
    );

  beforeEach(() => cachePerfiles.delete('u1'));

  it('sin encabezado: sin sesión, sin preguntar a nadie', async () => {
    const validar = jest.fn();
    expect(await armar(validar).empresaDe(undefined)).toBeNull();
    expect(validar).not.toHaveBeenCalled();
  });

  it('un encabezado que no es Bearer: sin sesión', async () => {
    const validar = jest.fn();
    expect(await armar(validar).empresaDe('Basic abc')).toBeNull();
    expect(validar).not.toHaveBeenCalled();
  });

  it('un pase que no vale: sin sesión, sin lanzar error', async () => {
    const validar = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('Invalid token'));
    expect(await armar(validar).empresaDe('Bearer vencido')).toBeNull();
  });

  it('un pase válido: la empresa del perfil, y el perfil queda recordado', async () => {
    const validar = jest.fn().mockResolvedValue({ id: 'u1' });
    const perfil = jest
      .fn()
      .mockResolvedValue({ data: { id: 'u1', company_id: 7 }, error: null });
    const sesion = armar(validar, perfil);
    expect(await sesion.empresaDe('Bearer bueno')).toBe(7);
    expect(await sesion.empresaDe('Bearer bueno')).toBe(7);
    expect(perfil).toHaveBeenCalledTimes(1);
  });

  it('un usuario sin perfil: sin sesión', async () => {
    const validar = jest.fn().mockResolvedValue({ id: 'u1' });
    const perfil = jest.fn().mockResolvedValue({ data: null, error: null });
    expect(await armar(validar, perfil).empresaDe('Bearer bueno')).toBeNull();
  });
});
