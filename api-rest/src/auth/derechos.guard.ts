import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DERECHO_KEY, SIN_PLAN_KEY } from './derecho.decorator';
import { assertDerecho, type Derecho } from './derechos';
import { IS_PUBLIC_KEY } from './public.decorator';

// El guardián de los derechos (14-09-2026, paso 3.2). Antes era
// ModulosPropiosGuard y cuidaba dos módulos; ahora cuida los derechos de
// todos los planes, que es el mismo trabajo con más nombres.
//
// Corre DESPUÉS de AuthGuard y RolesGuard (orden de registro en
// app.module): el usuario ya viene con su lista de derechos y el estado
// del plan de su empresa en request.user.
//
// El cargo y el derecho son dos preguntas distintas y ambas tienen que
// decir que sí: RolesGuard responde "¿este cargo puede?" y este responde
// "¿la empresa pagó por esto?".
//
// Reglas, en orden:
//  - Ruta @Public → no aplica (no hay sesión que consultar; esas rutas se
//    revisan en el servicio, resolviendo la empresa desde el token).
//  - Empresa bloqueada → 403 salvo en las rutas marcadas @SinPlan.
//  - Sin @Derecho, o con null en la ruta → pasa.
//  - Con derecho → la empresa de la sesión tiene que tenerlo.
@Injectable()
export class DerechosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<
      Request & {
        // `estado_plan` como texto: viene de la base tal cual.
        user?: { derechos?: Derecho[]; estado_plan?: string };
      }
    >();

    // La empresa que no pagó al terminar su prueba solo puede llegar a lo
    // que necesita para pagar. No se le borra ni un dato: cuando active su
    // plan, encuentra todo donde lo dejó.
    if (request.user?.estado_plan === 'bloqueado') {
      const sinPlan = this.reflector.getAllAndOverride<boolean>(SIN_PLAN_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!sinPlan) {
        throw new ForbiddenException({
          codigo: 'PLAN_BLOQUEADO',
          mensaje:
            'Tu prueba terminó. Elige un plan para volver a entrar; tus datos están guardados.',
        });
      }
      return true;
    }

    const derecho = this.reflector.getAllAndOverride<
      Derecho | null | undefined
    >(DERECHO_KEY, [context.getHandler(), context.getClass()]);
    if (!derecho) return true;

    assertDerecho(request.user?.derechos, derecho);
    return true;
  }
}
