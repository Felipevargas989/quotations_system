import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { UserRole } from 'src/users/entities/user.entity';
import { RolesGuard } from '../roles.guard';

// Fase 3: el guardián que aplica el CARGO en el backend.
describe('RolesGuard', () => {
  const contexto = (user?: { role?: string }): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const guardia = (esPublica: boolean, roles?: UserRole[]) => {
    const reflector = {
      getAllAndOverride: jest.fn((clave: string) =>
        clave === 'isPublic' ? esPublica : roles,
      ),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('una ruta pública pasa sin mirar cargos', () => {
    expect(
      guardia(true, [UserRole.ADMINISTRADOR]).canActivate(contexto()),
    ).toBe(true);
  });

  it('una ruta sin @Roles solo exige sesión (compatibilidad)', () => {
    expect(
      guardia(false, undefined).canActivate(
        contexto({ role: 'recepcion' }),
      ),
    ).toBe(true);
  });

  it('el cargo correcto pasa', () => {
    expect(
      guardia(false, [
        UserRole.OPERACIONES,
        UserRole.ADMINISTRADOR,
      ]).canActivate(contexto({ role: 'operaciones' })),
    ).toBe(true);
  });

  it('el cargo insuficiente recibe 403 con mensaje en español', () => {
    expect(() =>
      guardia(false, [UserRole.ADMINISTRADOR]).canActivate(
        contexto({ role: 'vendedor' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('sin cargo en la sesión, 403 (nunca dejar pasar por defecto)', () => {
    expect(() =>
      guardia(false, [UserRole.ADMINISTRADOR]).canActivate(contexto({})),
    ).toThrow(ForbiddenException);
  });
});
