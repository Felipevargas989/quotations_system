import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { esLicita } from './instalacion';
import { rutaAbiertaEnLicita } from './rutas-de-licita';

// EL PORTERO DE LA INSTALACIÓN (paso 2 del plan de Licita, 25-11). En
// Licita, lo que no es de Oportunidades ni de la lista mínima
// (`rutas-de-licita.ts`) responde 404, igual que una ruta que no existe. En
// Eventia deja pasar todo, sin mirar nada.
//
// Mira el prefijo del controlador y, desde la segunda tanda (25-11), también
// la ruta exacta del método (`PATH_METADATA` y `METHOD_METADATA` del
// decorador `@Get`/`@Post`...): así cierra `POST users/signup` dentro de
// `users` y abre lo justo de `pagos`.
//
// Es el PRIMER guardia global de `app.module.ts`: corre antes de pedir la
// sesión, así una ruta cerrada no dice «sin sesión» (401) sino que no existe.

@Injectable()
export class PorteroDeLaInstalacionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!esLicita()) return true;
    if (context.getType() !== 'http') return true;
    const prefijo = Reflect.getMetadata(PATH_METADATA, context.getClass()) as
      | string
      | string[]
      | undefined;
    const manejador = context.getHandler();
    const rutaDelMetodo = Reflect.getMetadata(PATH_METADATA, manejador) as
      | string
      | string[]
      | undefined;
    const numero = Reflect.getMetadata(METHOD_METADATA, manejador) as
      | RequestMethod
      | undefined;
    const metodo = numero === undefined ? undefined : RequestMethod[numero];
    if (rutaAbiertaEnLicita(prefijo, rutaDelMetodo, metodo)) return true;
    const pedido = context.switchToHttp().getRequest<Request>();
    // El mismo texto que da Nest a una ruta que no existe.
    throw new NotFoundException(
      `Cannot ${pedido?.method ?? 'GET'} ${pedido?.path ?? ''}`,
    );
  }
}
