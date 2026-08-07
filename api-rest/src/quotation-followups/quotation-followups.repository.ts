import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
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

  // Solo las tres columnas que el semáforo necesita, ya ordenadas de la
  // más nueva a la más vieja: el service se queda con la primera fila
  // de cada cotización (volúmenes chicos, sin RPC).
  async findMapRows(companyId: Company['id']) {
    this.logger.info(`findMapRows company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('quotation_followups')
      .select(
        'quotation_id, created_at, next_contact_date, next_contact_done_at',
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as FollowupMapRow[];
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
