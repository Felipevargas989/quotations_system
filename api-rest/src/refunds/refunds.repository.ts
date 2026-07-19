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
