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

    // Los ABONOS de esas cuotas. Una cuota se queda con su monto
    // original aunque le hayan pagado la mitad: lo pagado vive en
    // payment_transactions. Sin restarlo, "por cobrar" cuenta plata que
    // ya está en la cuenta (07-08: la #332 mostraba $1.623.600 vencidos
    // cuando lo que faltaba eran $823.600).
    const cuotas = (pagos.data || []) as {
      id: string;
      amount: number;
      status: string;
      due_date: string | null;
    }[];
    const abonadoPorCuota = new Map<string, number>();
    if (cuotas.length) {
      const { data: abonos, error: errAbonos } = await this.supabase.client
        .from('payment_transactions')
        .select('payment_id, amount')
        .in(
          'payment_id',
          cuotas.map((c) => c.id),
        );
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

    let pendiente = 0;
    let vencido = 0;
    for (const p of cuotas) {
      // Lo que FALTA, nunca negativo: un abono de más no puede descontar
      // de otra cuota.
      const resta = Math.max(
        (Number(p.amount) || 0) - (abonadoPorCuota.get(p.id) || 0),
        0,
      );
      if (resta === 0) continue;
      const vencidoYa =
        p.status === 'vencido' || (p.due_date && p.due_date < hoy);
      if (vencidoYa) vencido += resta;
      else pendiente += resta;
    }

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
