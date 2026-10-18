import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { DecisionDelChoque, DecisionGuardada } from './choques';

// LO QUE LOS CHOQUES DE FECHA LEEN Y GUARDAN (mapa 02 §5.6): las
// cotizaciones de hoy en adelante y las decisiones de `choques_de_fecha`
// (migración 143). Todo filtrado por empresa: la llave de servicio salta el
// RLS. La línea de la bitácora la escribe QuotationFollowupsService.

export type FilaDelChoque = {
  id: string;
  quotation_number: number;
  quotation_status: string;
  event_date: string | null;
  event_end_date: string | null;
  items?: unknown;
  clients: { name: string | null } | null;
};

const COLUMNAS =
  'id, quotation_number, quotation_status, event_date, event_end_date, clients(name)';

@Injectable()
export class ChoquesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ChoquesRepository.name);
  }

  /** Recorre por páginas: la base entrega de a 1.000 filas como máximo. */
  private async todas<T>(
    consulta: (
      desde: number,
      hasta: number,
    ) => PromiseLike<{ data: unknown; error: unknown }>,
  ): Promise<T[]> {
    const PAGINA = 1000;
    const filas: T[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await consulta(desde, desde + PAGINA - 1);
      if (error) throw new Error((error as { message?: string }).message);
      const lote = (data ?? []) as T[];
      filas.push(...lote);
      if (lote.length < PAGINA) break;
    }
    return filas;
  }

  /** Las cotizaciones (no requerimientos) en esos estados que todavía no
   *  terminan: empiezan o terminan desde `desde` (AAAA-MM-DD). */
  async cotizaciones(
    companyId: number,
    estados: string[],
    desde: string,
    conItems = false,
  ): Promise<FilaDelChoque[]> {
    const db = this.supabase.client;
    return this.todas<FilaDelChoque>((d, h) =>
      db
        .from('quotations')
        .select(conItems ? `${COLUMNAS}, items` : COLUMNAS)
        .eq('company_id', companyId)
        .eq('request_type', 'cotizacion')
        .in('quotation_status', estados)
        .or(`event_date.gte."${desde}",event_end_date.gte."${desde}"`)
        .order('quotation_number')
        .range(d, h),
    );
  }

  /** Una cotización de la empresa, con su foto (para la exclusividad). */
  async una(companyId: number, id: string): Promise<FilaDelChoque | null> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(`${COLUMNAS}, items`)
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as FilaDelChoque | null;
  }

  async decisiones(companyId: number): Promise<DecisionGuardada[]> {
    const db = this.supabase.client;
    return this.todas<DecisionGuardada>((d, h) =>
      db
        .from('choques_de_fecha')
        .select(
          'quotation_id, aceptada_id, decision, fechas_viva, fechas_aceptada',
        )
        .eq('company_id', companyId)
        .order('id')
        .range(d, h),
    );
  }

  /** Guarda (o reemplaza) la decisión de un par. */
  async guardar(fila: {
    company_id: number;
    quotation_id: string;
    aceptada_id: string;
    decision: DecisionDelChoque;
    fechas_viva: string;
    fechas_aceptada: string;
    followup_id: number | null;
    decidido_por: string | null;
  }): Promise<void> {
    const { error } = await this.supabase.client
      .from('choques_de_fecha')
      .upsert(
        { ...fila, decidido_at: new Date().toISOString() },
        { onConflict: 'quotation_id,aceptada_id' },
      );
    if (error) throw error;
  }
}
