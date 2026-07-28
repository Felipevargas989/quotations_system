import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from 'src/users/entities/user.entity';
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

    const rolesPermitidos = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!rolesPermitidos || rolesPermitidos.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { role?: string } }>();
    const cargo = request.user?.role as UserRole | undefined;

    if (!cargo || !rolesPermitidos.includes(cargo)) {
      throw new ForbiddenException(
        'Tu cargo no tiene permiso para esta función.',
      );
    }
    return true;
  }
}
