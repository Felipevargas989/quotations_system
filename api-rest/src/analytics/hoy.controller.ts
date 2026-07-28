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
          'amount, status, due_date, quotations!inner(company_id, quotation_status)',
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

    let pendiente = 0;
    let vencido = 0;
    for (const p of (pagos.data || []) as {
      amount: number;
      status: string;
      due_date: string | null;
    }[]) {
      const amount = Number(p.amount) || 0;
      const vencidoYa =
        p.status === 'vencido' || (p.due_date && p.due_date < hoy);
      if (vencidoYa) vencido += amount;
      else pendiente += amount;
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
