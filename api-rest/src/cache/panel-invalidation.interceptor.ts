import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { invalidarPanelEmpresa } from './memoria';

// FASE VELOCIDAD (28-07) — el seguro de la memoria del panel: cuando
// CUALQUIER escritura (POST/PATCH/DELETE) de una empresa termina bien,
// el panel de análisis de esa empresa se borra de la memoria y se
// recalcula fresco a la próxima visita. Borra de más a propósito
// (p. ej. subir un documento también borra): borrar de más es gratis,
// mostrar números viejos no.
@Injectable()
export class PanelInvalidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<{ method: string; user?: { company_id?: number } }>();
    if (req.method === 'GET' || !req.user?.company_id) {
      return next.handle();
    }
    const companyId = req.user.company_id;
    // tap: SOLO si la escritura terminó sin error (después, no antes —
    // borrar antes dejaría una carrera que re-guarda datos viejos).
    return next.handle().pipe(tap(() => invalidarPanelEmpresa(companyId)));
  }
}
