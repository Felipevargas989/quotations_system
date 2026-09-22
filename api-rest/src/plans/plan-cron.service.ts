import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';

// EL RELOJ DE LOS PLANES (14-09-2026 el de las pruebas; 16-09-2026
// aprende el cobro, sprint B del paso 4+5).
//
// Corre a las 11:00 como los demás relojes de la casa, y decide con
// FECHAS, nunca con avisos: los avisos de Mercado Pago mueven las
// fechas (pagado_hasta, gracia_hasta) y este reloj las cosecha. Si un
// aviso se pierde, el reloj igual hace justicia al día siguiente.
//
// La regla por encima de todas (plan §3.3): `gratis` NO EXISTE para
// este reloj. Cada consulta filtra por estado (prueba / activo /
// moroso), así que una cortesía jamás calza — y hay una prueba que
// mete a una empresa gratis con todas las fechas vencidas y exige que
// nadie la toque.
@Injectable()
export class PlanCronService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly derechosService: DerechosService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
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

  /**
   * "Te quedan 2 días de prueba" (sprint B, punto 9). La ventana de un
   * día [mañana+1, mañana+2) hace que cada empresa reciba el aviso UNA
   * sola vez aunque el reloj corra todos los días.
   */
  @Cron('5 11 * * *')
  async avisarPruebasPorVencer() {
    const desde = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const hasta = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase.client
      .from('companies')
      .select('id, name, prueba_vence')
      .eq('estado_plan', 'prueba')
      .gte('prueba_vence', desde)
      .lt('prueba_vence', hasta);
    if (error) {
      this.logger.error(
        `no pude revisar las pruebas por vencer: ${error.message}`,
      );
      return;
    }
    for (const empresa of data ?? []) {
      await this.avisarAdministradores(
        empresa.id,
        EmailStructure.PRUEBA_POR_VENCER,
        {
          companyName: empresa.name,
          pruebaVence: empresa.prueba_vence,
        },
      );
    }
  }

  /**
   * La cosecha del cobro (sprint B, punto 8). Tres casos, en orden:
   *  1. Activa con lo pagado vencido y SIN suscripción viva → canceló
   *     (decisión 5): bloqueada directo, conserva sus datos.
   *  2. Activa con lo pagado vencido y suscripción viva → el cobro no
   *     llegó: morosa con 7 días de gracia (decisión 2) y aviso. Es la
   *     RED del webhook: normalmente el aviso de pago rechazado ya la
   *     dejó morosa; esto pesca los avisos que se perdieron.
   *  3. Morosa con la gracia vencida → bloqueada.
   */
  @Cron('10 11 * * *')
  async cosecharCobrosVencidos() {
    const ahora = new Date().toISOString();
    const gracia = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 0. Bajadas agendadas (cambio de plan, 18-09) cuyo mes pagado ya
    //    terminó y cuyo cobro nuevo aún no avisa: el reloj las aplica.
    //    PostgREST no sabe "plan = plan_programado" en un solo update,
    //    así que se leen y se aplican una a una.
    const { data: bajadas } = await this.supabase.client
      .from('companies')
      .select('id, name, plan_programado')
      .eq('estado_plan', 'activo')
      .not('plan_programado', 'is', null)
      .not('pagado_hasta', 'is', null)
      .lt('pagado_hasta', ahora);
    for (const empresa of bajadas ?? []) {
      await this.supabase.client
        .from('companies')
        .update({
          plan: empresa.plan_programado,
          plan_programado: null,
          plan_cambiado_en: ahora,
        })
        .eq('id', empresa.id);
      this.derechosService.olvidar(empresa.id);
      this.logger.info(
        `empresa ${empresa.id} (${empresa.name}): bajó a ${empresa.plan_programado} al terminar su mes pagado`,
      );
    }

    // 1. Canceladas con el mes pagado ya cumplido → bloqueadas.
    const { data: canceladas } = await this.supabase.client
      .from('companies')
      .update({ estado_plan: 'bloqueado', plan_cambiado_en: ahora })
      .eq('estado_plan', 'activo')
      .eq('pago_proveedor', 'mercadopago')
      .is('pago_suscripcion_id', null)
      .not('pagado_hasta', 'is', null)
      .lt('pagado_hasta', ahora)
      .select('id, name');
    for (const empresa of canceladas ?? []) {
      this.derechosService.olvidar(empresa.id);
      this.logger.warn(
        `empresa ${empresa.id} (${empresa.name}): canceló y terminó su mes pagado — bloqueada`,
      );
    }

    // 2. Activas con lo pagado vencido y suscripción viva → morosas.
    const { data: morosas } = await this.supabase.client
      .from('companies')
      .update({
        estado_plan: 'moroso',
        plan_cambiado_en: ahora,
        gracia_hasta: gracia,
      })
      .eq('estado_plan', 'activo')
      .eq('pago_proveedor', 'mercadopago')
      .not('pago_suscripcion_id', 'is', null)
      .not('pagado_hasta', 'is', null)
      .lt('pagado_hasta', ahora)
      .select('id, name');
    for (const empresa of morosas ?? []) {
      this.derechosService.olvidar(empresa.id);
      this.logger.warn(
        `empresa ${empresa.id} (${empresa.name}): pago vencido sin aviso — morosa con gracia hasta ${gracia}`,
      );
      await this.avisarAdministradores(
        empresa.id,
        EmailStructure.PAGO_FALLIDO,
        { companyName: empresa.name, graciaHasta: gracia },
      );
    }

    // 3. Morosas con la gracia cumplida → bloqueadas.
    const { data: bloqueadas } = await this.supabase.client
      .from('companies')
      .update({ estado_plan: 'bloqueado', plan_cambiado_en: ahora })
      .eq('estado_plan', 'moroso')
      .not('gracia_hasta', 'is', null)
      .lt('gracia_hasta', ahora)
      .select('id, name');
    for (const empresa of bloqueadas ?? []) {
      this.derechosService.olvidar(empresa.id);
      this.logger.warn(
        `empresa ${empresa.id} (${empresa.name}): gracia vencida — bloqueada`,
      );
    }
  }

  /** El aviso va a los administradores de la empresa; el correo jamás
   *  bota al reloj. */
  private async avisarAdministradores(
    companyId: number,
    tipo: EmailStructure.PAGO_FALLIDO | EmailStructure.PRUEBA_POR_VENCER,
    params: {
      companyName?: string | null;
      pruebaVence?: string | null;
      graciaHasta?: string | null;
    },
  ) {
    try {
      const usuarios = await this.usersService.findAll(companyId);
      const correos = usuarios
        .filter((u) => u.role === UserRole.ADMINISTRADOR)
        .map((u) => u.email)
        .filter(Boolean);
      for (const correo of correos) {
        if (tipo === EmailStructure.PAGO_FALLIDO) {
          await this.emailService.sendEmail(correo, tipo, {
            companyName: params.companyName,
            graciaHasta: params.graciaHasta,
          });
        } else {
          await this.emailService.sendEmail(correo, tipo, {
            companyName: params.companyName,
            pruebaVence: params.pruebaVence,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `no pude avisar a la empresa ${companyId}: ${mensajeDe(error)}`,
      );
    }
  }
}
