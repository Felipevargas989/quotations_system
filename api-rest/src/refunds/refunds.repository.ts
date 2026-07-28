import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateRefundPayload } from './types';

@Injectable()
export class RefundsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefundsRepository.name);
  }

  create(refund: CreateRefundPayload) {
    this.logger.info(
      `create refund with refund params ${JSON.stringify(refund)}`,
    );
    return this.supabase.client
      .from('refunds')
      .insert(refund)
      .select()
      .single();
  }

  // Reembolsos PENDIENTES (no pagados) de una cotización, del más antiguo
  // al más nuevo — orden en que la compensación (tarea #42) los consume.
  findPendingByQuotation(quotationId: string) {
    this.logger.info(
      `findPendingByQuotation refunds for quotation ${quotationId}`,
    );
    return this.supabase.client
      .from('refunds')
      .select('*')
      .eq('quotation_id', quotationId)
      .eq('is_paid', false)
      .order('created_at', { ascending: true });
  }

  updateAmount(id: string, amount: number) {
    this.logger.info(`updateAmount refund ${id} -> ${amount}`);
    return this.supabase.client
      .from('refunds')
      .update({ amount })
      .eq('id', id);
  }

  remove(id: string) {
    this.logger.info(`remove refund ${id}`);
    return this.supabase.client.from('refunds').delete().eq('id', id);
  }

  // ---------- Mudanza #7 (28-07): Post-Venta por el backend ----------

  // Reembolsos de una cotización, acotados a la EMPRESA (el frontend
  // consultaba solo por quotation_id).
  async findByQuotation(companyId: Company['id'], quotationId: string) {
    this.logger.info(`findByQuotation refunds ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('refunds')
      .select('*, quotations!inner(company_id)')
      .eq('quotation_id', quotationId)
      .eq('quotations.company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // Suma de reembolsos YA PAGADOS por cotización — SOLO de la empresa
  // (la versión directa sumaba las devoluciones de TODAS las empresas).
  async paidMapByCompany(companyId: Company['id']) {
    this.logger.info(`paidMapByCompany company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('refunds')
      .select('quotation_id, amount, quotations!inner(company_id)')
      .eq('is_paid', true)
      .eq('quotations.company_id', companyId);
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const r of data || []) {
      const qid = r.quotation_id as string;
      map[qid] = (map[qid] || 0) + (Number(r.amount) || 0);
    }
    return map;
  }

  // Completa (registra) un reembolso: fecha, medio, monto y comprobante.
  async registerPaid(
    companyId: Company['id'],
    id: string,
    fields: {
      amount: number;
      refund_date: string;
      payment_method: string;
      receipt_url?: string | null;
    },
  ) {
    this.logger.info(`registerPaid refund ${id} company ${companyId}`);
    // El refund no tiene company_id propio: se verifica vía su cotización.
    const { data: propio, error: errPropio } = await this.supabase.client
      .from('refunds')
      .select('id, quotations!inner(company_id)')
      .eq('id', id)
      .eq('quotations.company_id', companyId)
      .single();
    if (errPropio || !propio) {
      throw errPropio || new Error('Reembolso no encontrado');
    }
    const { error } = await this.supabase.client
      .from('refunds')
      .update({ ...fields, is_paid: true })
      .eq('id', id);
    if (error) throw error;
    return { registered: true };
  }

  findAll(companyId: Company['id']) {
    this.logger.info(`findAll refunds with companyId ${companyId}`);
    return this.supabase.client
      .from('refunds')
      .select(
        `
        *,
        quotations (
          id,
          quotation_number,
          clients (
            id,
            name
          )
        )
      `,
      )
      .eq('quotations.company_id', companyId)
      .order('created_at', { ascending: false });
  }
}
