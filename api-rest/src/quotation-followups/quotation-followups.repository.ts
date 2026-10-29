import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { SupabaseService } from 'src/supabase/supabase.service';
import { QuotationFollowup } from './entities/quotation-followup.entity';
import {
  CreateFollowupPayload,
  FollowupMapRow,
  UpdateFollowupPayload,
} from './types';

// Bitácora comercial (03-08): TODAS las consultas se acotan por
// company_id — el cliente de Supabase usa la service-role key y salta
// RLS, así que el aislamiento por empresa vive acá o no vive.
@Injectable()
export class QuotationFollowupsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationFollowupsRepository.name);
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

  // Solo las columnas que el semáforo necesita, ya ordenadas de la más
  // nueva a la más vieja: el service se queda con la primera fila de
  // cada cotización. Solo las notas de cotizaciones en `estados` (lo
  // vivo, 28-10-2026) y por páginas: hasta ese día se leía todo de una
  // vez y la base corta en 1.000 filas sin avisar (había 742). El `id`
  // desempata el orden para que las páginas no repitan ni salten notas.
  async findMapRows(companyId: Company['id'], estados: QuotationStatus[]) {
    this.logger.info(`findMapRows company ${companyId}`);
    const db = this.supabase.client;
    return this.todas<FollowupMapRow>((desde, hasta) =>
      db
        .from('quotation_followups')
        .select(
          'quotation_id, created_at, next_contact_date, next_contact_done_at, quotations!inner(quotation_status)',
        )
        .eq('company_id', companyId)
        .in('quotations.quotation_status', estados)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(desde, hasta),
    );
  }

  async findByQuotation(companyId: Company['id'], quotationId: string) {
    this.logger.info(`findByQuotation followups ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('quotation_followups')
      .select('*')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as QuotationFollowup[];
  }

  // Verifica que la cotización exista Y sea de la empresa de la sesión
  // (candado previo al insert: nadie anota en cotizaciones ajenas).
  async findOwnedQuotation(companyId: Company['id'], quotationId: string) {
    this.logger.info(`findOwnedQuotation ${quotationId} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('id')
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as { id: string } | null;
  }

  // Una nota puntual, acotada a la empresa: alimenta el candado de
  // autor en editar/eliminar.
  async findById(companyId: Company['id'], id: number) {
    this.logger.info(`findById followup ${id} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('quotation_followups')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as QuotationFollowup | null;
  }

  async create(followup: CreateFollowupPayload) {
    this.logger.info(`create followup for quotation ${followup.quotation_id}`);
    const { data, error } = await this.supabase.client
      .from('quotation_followups')
      .insert([followup])
      .select()
      .single();
    if (error) throw error;
    return data as QuotationFollowup;
  }

  async update(
    companyId: Company['id'],
    id: number,
    fields: UpdateFollowupPayload,
  ) {
    this.logger.info(`update followup ${id} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('quotation_followups')
      .update(fields)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data as QuotationFollowup;
  }

  async remove(companyId: Company['id'], id: number) {
    this.logger.info(`remove followup ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('quotation_followups')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }
}
