import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CINCO_MINUTOS_MS,
  cacheDerechos,
  olvidarDerechos,
} from 'src/cache/memoria';
import { SupabaseService } from 'src/supabase/supabase.service';
import { derechosDe, type Derechos, type EmpresaConPlan } from './derechos';

// LOS DERECHOS DE UNA EMPRESA SIN SESIÓN (14-09-2026, paso 3.2).
//
// La sesión ya trae los derechos puestos por AuthGuard, y ese es el camino
// normal. Pero hay dos lugares donde no hay sesión y el candado igual tiene
// que aplicarse:
//
//  - Las puertas públicas: el portal del cliente y la encuesta se abren con
//    un enlace secreto, no con una cuenta. Ahí la empresa se resuelve desde
//    el token y los derechos se preguntan acá.
//  - Los relojes: recorren cotizaciones o pagos de todas las empresas y
//    solo tienen a mano el company_id.
//
// Por eso lleva memoria de 5 minutos: un reloj que manda 200 correos no va
// a preguntar 200 veces por la misma empresa.
@Injectable()
export class DerechosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DerechosService.name);
  }

  async deEmpresa(companyId: number): Promise<Derechos> {
    const clave = String(companyId);
    const enMemoria = cacheDerechos.get(clave);
    if (enMemoria) return enMemoria as Derechos;

    const { data, error } = await this.supabase.client
      .from('companies')
      .select('plan, estado_plan, modulos_propios')
      .eq('id', companyId)
      .single();

    if (error) {
      // Si la empresa no se puede leer, NO se le quita nada: se responde
      // con los derechos de una empresa en prueba, que los tiene todos.
      // Un problema de lectura no puede apagarle el portal a un cliente
      // que sí pagó.
      this.logger.warn(
        `no pude leer los derechos de la empresa ${companyId}: ${error.message}`,
      );
      return derechosDe({ estado_plan: 'prueba' });
    }

    const derechos = derechosDe(data as EmpresaConPlan);
    cacheDerechos.set(clave, derechos, CINCO_MINUTOS_MS);
    return derechos;
  }

  /** Tras cambiar el plan de una empresa, para que rija al instante. */
  olvidar(companyId: number): void {
    olvidarDerechos(companyId);
  }
}
