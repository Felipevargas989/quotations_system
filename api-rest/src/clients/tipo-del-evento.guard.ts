import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AlcanceDeRecepcion } from './alcance-de-recepcion';
import { DEL_EVENTO_KEY, type DondeEstaElEvento } from './del-evento.decorator';

// EL TIPO DE CLIENTE DEL EVENTO (doc 22 §9, tanda 2). Las puertas de
// Post-Venta que tocan un evento dicen con `@DelEvento` dónde viene su
// cotización; este guardián deja pasar solo si el cargo la ve (los
// requerimientos, siempre; las cotizaciones, si trabaja el tipo de su
// cliente). Un cargo que trabaja todos los tipos pasa sin preguntarle a la
// base, como siempre. Corre después del cargo, los permisos y los derechos
// (app.module).

type ConSesion = Request & {
  user?: { role?: string | null; company_id?: number };
};

const texto = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : null;

/** Los ids de cotización que trae la petición (sin repetir). */
export const cotizacionesDe = (
  donde: DondeEstaElEvento,
  request: Pick<Request, 'params' | 'query' | 'body'>,
): string[] => {
  const cuerpo = (request.body ?? {}) as Record<string, unknown>;
  let ids: unknown[] = [];
  if ('param' in donde && !('tabla' in donde)) {
    ids = [request.params?.[donde.param]];
  } else if ('query' in donde) {
    ids = [request.query?.[donde.query]];
  } else if ('body' in donde) {
    const v = cuerpo[donde.body];
    ids = Array.isArray(v) ? v : [v];
  } else if ('filas' in donde) {
    const filas = cuerpo[donde.filas];
    ids = Array.isArray(filas)
      ? filas.map((f) => (f as Record<string, unknown> | null)?.[donde.campo])
      : [];
  }
  return [...new Set(ids.map(texto).filter((x): x is string => !!x))];
};

@Injectable()
export class TipoDelEventoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly alcance: AlcanceDeRecepcion,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const donde = this.reflector.get<DondeEstaElEvento | undefined>(
      DEL_EVENTO_KEY,
      context.getHandler(),
    );
    if (!donde) return true;
    const request = context.switchToHttp().getRequest<ConSesion>();
    const user = request.user;
    // Sin sesión no hay cargo que revisar: AuthGuard ya respondió.
    if (!user?.company_id) return true;
    const sesion = { role: user.role, company_id: user.company_id };
    if (!(await this.alcance.tiposDelCargo(sesion))) return true;
    if ('tabla' in donde) {
      const id = texto(request.params?.[donde.param]);
      if (id) await this.alcance.exigirQueLaVeaLaFila(sesion, donde.tabla, id);
      return true;
    }
    for (const id of cotizacionesDe(donde, request)) {
      await this.alcance.exigirQueLaVea(sesion, id);
    }
    return true;
  }
}
