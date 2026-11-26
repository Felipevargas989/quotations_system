import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { esLicita } from 'src/instalacion/instalacion';

// LAS RUTAS QUE SOLO EXISTEN EN LICITA (25-11). Fuera de Licita responden
// 404 con el mismo texto que Nest da a una ruta que no existe, ANTES de
// validar el cuerpo (los guardias corren antes que los pipes): en Eventia
// un cuerpo malo tampoco dice 400.
@Injectable()
export class SoloEnLicitaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (esLicita()) return true;
    const pedido = context.switchToHttp().getRequest<Request>();
    throw new NotFoundException(
      `Cannot ${pedido?.method ?? 'POST'} ${pedido?.path ?? ''}`,
    );
  }
}
