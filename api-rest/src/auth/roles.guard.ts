import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from 'src/users/entities/user.entity';
import { DENTRO_DE_KEY, PERMISO_KEY } from './permiso.decorator';
import {
  MENSAJE_SIN_PERMISO,
  pasa,
  permisosDelCargo,
  sinPermiso,
  type Permiso,
} from './permisos';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

// Fase 3 (28-07): el backend APLICA el cargo del usuario.
//
// Antes solo se comprobaba que existiera sesión: cualquier usuario
// conectado podía, técnicamente, llamar funciones administrativas.
// Ahora las rutas marcadas con @Roles exigen el cargo declarado.
//
// Reglas:
//  - Ruta @Public → no aplica (el AuthGuard ya la dejó pasar).
//  - Ruta sin @Roles → basta la sesión (compatibilidad: se van
//    marcando rutas por etapas, empezando por las mutaciones).
//  - El @Roles de un handler MANDA sobre el del controller.
//  - Permisos por cargo (doc 22, 05-11-2026): la ruta con @Permiso o
//    @DentroDe se decide con la cuenta de `pasa` y los permisos prendidos
//    del cargo, que AuthGuard deja en la sesión. Sin la lista (un camino
//    que arma la sesión a mano), los de fábrica, que son lo de hoy.
//
// Corre DESPUÉS de AuthGuard (orden de registro en app.module), que ya
// dejó el usuario con su cargo en request.user.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const lee = <T>(clave: string) =>
      this.reflector.getAllAndOverride<T | undefined>(clave, [
        context.getHandler(),
        context.getClass(),
      ]);
    const rolesPermitidos = lee<UserRole[]>(ROLES_KEY);
    const permiso = lee<Permiso[]>(PERMISO_KEY);
    const dentroDe = lee<Permiso[]>(DENTRO_DE_KEY);

    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { role?: string; permisos?: Permiso[] } }
      >();
    const cargo = request.user?.role as UserRole | undefined;

    if (permiso?.length || dentroDe?.length) {
      const prendidos = request.user?.permisos ?? permisosDelCargo(cargo);
      const marcas = { roles: rolesPermitidos, permiso, dentroDe };
      if (!pasa(cargo, prendidos, marcas)) throw sinPermiso();
      return true;
    }

    if (!rolesPermitidos || rolesPermitidos.length === 0) return true;
    if (!cargo || !rolesPermitidos.includes(cargo)) {
      throw new ForbiddenException(MENSAJE_SIN_PERMISO);
    }
    return true;
  }
}
