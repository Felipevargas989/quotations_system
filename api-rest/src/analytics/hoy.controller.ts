import { Controller, Get, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { User } from 'src/users/entities/user.entity';

// Mudanza #7 (28-07): la fila HOY del Dashboard por el backend. Misma
// cuenta que hacía el navegador (hoy.service.ts), ahora en el servidor.
const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export type CuotaAbierta = {
  id: string;
  amount: number;
  status: string;
  due_date: string | null;
};

/** Cuánto queda por cobrar, separando lo vencido de lo que aún no vence.
 *
 * Vive fuera de la clase para poder probarse sin simular Supabase: es
 * plata, y el error que arregló —contar la cuota entera ignorando los
 * abonos— estuvo mostrando el doble de deuda sin que nadie lo notara.
 *
 * Reglas, las tres:
 *  · A cada cuota se le resta lo ya abonado.
 *  · El resto nunca baja de cero: un abono de más no descuenta de otra.
 *  · La cuota que quedó en cero deja de contarse, aunque su estado siga
 *    diciendo "pendiente" (el cron la marca por fecha, no por saldo).
 */
export const sumarPorCobrar = (
  cuotas: CuotaAbierta[],
  abonadoPorCuota: Map<string, number>,
  hoy: string,
): { pendiente: number; vencido: number } => {
  let pendiente = 0;
  let vencido = 0;
  for (const c of cuotas) {
    const resta = Math.max(
      (Number(c.amount) || 0) - (abonadoPorCuota.get(c.id) || 0),
      0,
    );
    if (resta === 0) continue;
    const vencidoYa =
      c.status === 'vencido' || (c.due_date !== null && c.due_date < hoy);
    if (vencidoYa) vencido += resta;
    else pendiente += resta;
  }
  return { pendiente, vencido };
};

@Injectable()
export class HoyRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HoyRepository.name);
  }

  async alerts(companyId: number) {
    this.logger.info(`hoy alerts company ${companyId}`);
    const hoy = new Date().toISOString().split('T')[0];
    const en30 = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .split('T')[0];
    const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [pagos, eventos, reqs, envs] = await Promise.all([
      this.supabase.client
        .from('payments')
        .select(
          // El `id` viaja para poder descontar los abonos parciales: sin
          // él, una cuota de $1.623.600 con $800.000 ya pagados se
          // contaba entera (07-08, pillada de Felipe en la #332).
          'id, amount, status, due_date, quotations!inner(company_id, quotation_status)',
        )
        .eq('quotations.company_id', companyId)
        .neq('quotations.quotation_status', 'cancelada')
        .in('status', ['pendiente', 'vencido']),
      this.supabase.client
        .from('quotations')
        .select('id, event_date')
        .eq('company_id', companyId)
        .eq('quotation_status', 'aceptada')
        .gte('event_date', hoy)
        .lte('event_date', en30)
        .order('event_date', { ascending: true }),
      this.supabase.client
        .from('quotations')
        .select('id, created_at')
        .eq('company_id', companyId)
        .eq('request_type', 'requerimiento')
        .eq('quotation_status', 'solicitada')
        .order('created_at', { ascending: true }),
      this.supabase.client
        .from('quotations')
        .select('id, updated_at')
        .eq('company_id', companyId)
        .eq('quotation_status', 'enviada')
        .lt('updated_at', hace7)
        .order('updated_at', { ascending: true }),
    ]);
    if (pagos.error) throw pagos.error;
    if (eventos.error) throw eventos.error;
    if (reqs.error) throw reqs.error;
    if (envs.error) throw envs.error;

    // Los REEMBOLSOS no entran acá, y se midió por qué (07-08): en esta
    // casa un reembolso nace cuando el cliente pagó de MÁS (la #93 abonó
    // $1.638.000 sobre un total de $1.170.000). Esas cotizaciones quedan
    // pagadas y ni siquiera tienen cuotas pendientes: sumarlos como
    // deuda inventaría plata por cobrar que nadie debe.
    //
    // Los ABONOS de esas cuotas. Una cuota se queda con su monto
    // original aunque le hayan pagado la mitad: lo pagado vive en
    // payment_transactions. Sin restarlo, "por cobrar" cuenta plata que
    // ya está en la cuenta (07-08: la #332 mostraba $1.623.600 vencidos
    // cuando lo que faltaba eran $823.600).
    const cuotas = (pagos.data || []) as CuotaAbierta[];
    const abonadoPorCuota = new Map<string, number>();
    // De a 200 identificadores por consulta: cada uno es un UUID de 36
    // caracteres y viajan en la URL. Hoy son 14 cuotas abiertas y no se
    // nota, pero con el negocio creciendo una lista larga se pasa del
    // largo que acepta el servidor y ahí no se cae solo este número: se
    // cae el panel de alertas completo.
    const TANDA = 200;
    for (let i = 0; i < cuotas.length; i += TANDA) {
      const ids = cuotas.slice(i, i + TANDA).map((c) => c.id);
      const { data: abonos, error: errAbonos } = await this.supabase.client
        .from('payment_transactions')
        .select('payment_id, amount')
        .in('payment_id', ids);
      if (errAbonos) throw errAbonos;
      for (const a of (abonos || []) as {
        payment_id: string;
        amount: number;
      }[]) {
        abonadoPorCuota.set(
          a.payment_id,
          (abonadoPorCuota.get(a.payment_id) || 0) + (Number(a.amount) || 0),
        );
      }
    }

    const { pendiente, vencido } = sumarPorCobrar(cuotas, abonadoPorCuota, hoy);

    const evData = (eventos.data || []) as { event_date: string }[];
    const reqData = (reqs.data || []) as { created_at: string }[];
    const envData = (envs.data || []) as { updated_at: string }[];

    return {
      porCobrar: { pendiente, vencido },
      proximos: {
        count: evData.length,
        primera: evData[0]?.event_date || null,
      },
      requerimientos: {
        count: reqData.length,
        oldestDays: reqData[0] ? daysSince(reqData[0].created_at) : 0,
      },
      enviadas: {
        count: envData.length,
        oldestDays: envData[0] ? daysSince(envData[0].updated_at) : 0,
      },
    };
  }
}

// El Dashboard es sección de administrador.
@Roles(...ADMIN_ONLY)
@Controller('analytics')
export class HoyController {
  constructor(private readonly repo: HoyRepository) {}

  @Get('hoy')
  alerts(@CurrentUser() user: User) {
    return this.repo.alerts(user.company_id);
  }
}
