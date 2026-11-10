import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/users/entities/user.entity';
import type { Permiso } from '../permisos';
import { RolesGuard } from '../roles.guard';

// Fase 3: el guardián que aplica el CARGO en el backend. Desde el doc 22
// (05-11-2026), también los permisos por cargo de la empresa.
describe('RolesGuard', () => {
  const contexto = (user?: {
    role?: string;
    permisos?: Permiso[];
  }): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const guardia = (
    esPublica: boolean,
    roles?: UserRole[],
    marcas: { permiso?: Permiso[]; dentroDe?: Permiso[] } = {},
  ) => {
    const valores: Record<string, unknown> = {
      isPublic: esPublica,
      roles,
      permiso: marcas.permiso,
      dentroDe: marcas.dentroDe,
    };
    const reflector = {
      getAllAndOverride: jest.fn((clave: string) => valores[clave]),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  /** El código del 403, o null si pasó. */
  const codigo = (fn: () => boolean): string | null => {
    try {
      fn();
      return null;
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const r = (e as ForbiddenException).getResponse() as { codigo?: string };
      return r.codigo ?? 'sin código';
    }
  };

  it('una ruta pública pasa sin mirar cargos', () => {
    expect(
      guardia(true, [UserRole.ADMINISTRADOR]).canActivate(contexto()),
    ).toBe(true);
  });

  it('una ruta sin @Roles solo exige sesión (compatibilidad)', () => {
    expect(
      guardia(false, undefined).canActivate(contexto({ role: 'recepcion' })),
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

  describe('permisos por cargo (doc 22 §4.2)', () => {
    const OA = [UserRole.OPERACIONES, UserRole.ADMINISTRADOR];

    it('@Permiso: abre a quien tenga la sección prendida, aunque su @Roles no lo nombre', () => {
      const g = guardia(false, OA, { permiso: ['postventa'] });
      expect(
        codigo(() =>
          g.canActivate(
            contexto({ role: 'vendedor', permisos: ['postventa'] }),
          ),
        ),
      ).toBeNull();
    });

    it('@Permiso apagado: 403 SIN_PERMISO, también para el cargo de hoy', () => {
      const g = guardia(false, OA, { permiso: ['postventa'] });
      expect(
        codigo(() =>
          g.canActivate(
            contexto({ role: 'operaciones', permisos: ['cotizaciones'] }),
          ),
        ),
      ).toBe('SIN_PERMISO');
    });

    it('una puerta de varias secciones sigue abierta con una sola', () => {
      const g = guardia(false, OA, { permiso: ['postventa', 'cotizaciones'] });
      expect(
        codigo(() =>
          g.canActivate(
            contexto({ role: 'operaciones', permisos: ['cotizaciones'] }),
          ),
        ),
      ).toBeNull();
    });

    it('@DentroDe: exige el @Roles de hoy Y la sección prendida', () => {
      const g = guardia(false, [UserRole.ADMINISTRADOR], {
        dentroDe: ['postventa'],
      });
      const con = (role: string, permisos: Permiso[]) =>
        codigo(() => g.canActivate(contexto({ role, permisos })));
      expect(con('administrador', ['postventa'])).toBeNull();
      expect(con('administrador', ['cotizaciones'])).toBe('SIN_PERMISO');
      // Prenderle la sección a operaciones no le abre la acción fina.
      expect(con('operaciones', ['postventa'])).toBe('SIN_PERMISO');
    });

    it('sin la lista en la sesión, los de fábrica (lo de hoy)', () => {
      const g = guardia(false, OA, { permiso: ['postventa'] });
      expect(
        codigo(() => g.canActivate(contexto({ role: 'operaciones' }))),
      ).toBeNull();
      expect(codigo(() => g.canActivate(contexto({ role: 'vendedor' })))).toBe(
        'SIN_PERMISO',
      );
    });
  });
});
