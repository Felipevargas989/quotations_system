import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// EL RELOJ DE LAS PRUEBAS (14-09-2026, paso 3.2 del roadmap de venta).
//
// Una empresa nueva entra con 7 días de prueba y todos los derechos de
// Opera y Crece. Si al séptimo día no contrató, pasa a `bloqueado`: deja de
// entrar a las pantallas, pero NO se le borra ni un dato. El día que pague,
// Felipe le pone su plan desde la Torre de Control y encuentra todo donde
// lo dejó.
//
// Corre a las 11:00 como los demás relojes de la casa.
//
// Lo que este reloj NO hace todavía: avisarle por correo al cliente. Ese
// aviso tiene sentido cuando exista el cobro automático (paso 5 del
// roadmap) y pueda llevar el enlace para pagar. Por ahora el vencimiento se
// ve en la Torre de Control, que es donde Felipe vende a mano.
@Injectable()
export class PlanCronService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly derechosService: DerechosService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlanCronService.name);
  }

  @Cron('0 11 * * *')
  async bloquearPruebasVencidas() {
    const ahora = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .from('companies')
      .update({ estado_plan: 'bloqueado', plan_cambiado_en: ahora })
      .eq('estado_plan', 'prueba')
      .not('prueba_vence', 'is', null)
      .lt('prueba_vence', ahora)
      .select('id, name');

    if (error) {
      this.logger.error(
        `no pude revisar las pruebas vencidas: ${error.message}`,
      );
      return;
    }

    const bloqueadas = data ?? [];
    for (const empresa of bloqueadas) {
      // Que rija al instante: si no, la empresa seguiría entrando hasta
      // cinco minutos más, con los derechos guardados en memoria.
      this.derechosService.olvidar(empresa.id);
      this.logger.warn(
        `prueba vencida: la empresa ${empresa.id} (${empresa.name}) queda bloqueada`,
      );
    }
    if (bloqueadas.length > 0) {
      this.logger.info(
        `${bloqueadas.length} prueba(s) vencida(s) bloqueada(s)`,
      );
    }
  }
}
