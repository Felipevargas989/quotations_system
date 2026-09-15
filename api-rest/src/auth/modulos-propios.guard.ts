import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  MODULO_PROPIO_KEY,
  type ModuloPropio,
} from './modulo-propio.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

// El guardián de los módulos propios (14-09-2026). Corre DESPUÉS de
// AuthGuard y RolesGuard (orden de registro en app.module): el usuario
// ya viene con la lista de módulos de su empresa en request.user.
//
// Reglas:
//  - Ruta @Public → no aplica.
//  - Sin @ModuloPropio (o con null en la ruta) → pasa.
//  - Con módulo → la empresa de la sesión tiene que tenerlo encendido.
@Injectable()
export class ModulosPropiosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const modulo = this.reflector.getAllAndOverride<
      ModuloPropio | null | undefined
    >(MODULO_PROPIO_KEY, [context.getHandler(), context.getClass()]);
    if (!modulo) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { modulos_propios?: string[] } }>();
    const modulos = request.user?.modulos_propios ?? [];
    if (!modulos.includes(modulo)) {
      throw new ForbiddenException(
        'Este módulo no está disponible para tu empresa.',
      );
    }
    return true;
  }
}
