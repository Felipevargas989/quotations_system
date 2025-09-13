import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { Payment } from './entities/payment.entity';
import { PaymentWithTransactionsAndQuotation } from './interfaces/payments.types';

@Injectable()
export class PaymentsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PaymentsRepository.name);
  }
  async findAllPaymentsFromQuotation(
    quotationId: Quotation['id'],
    companyId: Company['id'],
  ) {
    this.logger.info(
      `findAllPaymentsFromQuotation with quotationId ${quotationId} and companyId ${companyId}`,
    );
    return this.supabase.client
      .from('payments')
      .select(
        `
        *,
        quotations (
          company_id
        )
        `,
      )
      .eq('quotations.company_id', companyId)
      .eq('quotation_id', quotationId);
  }

  async findAllPaymentsWithTransactions(companyId: Company['id']): Promise<{
    data: PaymentWithTransactionsAndQuotation[];
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `findAllPaymentsWithTransactions with companyId ${companyId}`,
    );
    const { data, error } = await this.supabase.client
      .from('payments')
      .select(
        `
      *,
      quotations!inner (
        id,
        company_id,
        quotation_number,
        total_amount,
        requires_invoice,
        has_contract
      ),
      payment_transactions (
        id,
        amount,
        transaction_date,
        created_at
      )
    `,
      )
      .eq('quotations.company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(error);
      return { data: [], error };
    }
    return { data: data as PaymentWithTransactionsAndQuotation[], error };
  }

  async createPaymentPlan(payments: Payment[]) {
    this.logger.info(
      `createPaymentPlan with payments ${JSON.stringify(payments)}`,
    );
    return this.supabase.client.from('payments').insert(payments);
  }

  async deletePaymentsByQuotationId(
    quotationId: Quotation['id'],
    companyId: Company['id'],
  ) {
    this.logger.info(
      `deletePaymentsByQuotationId with quotationId ${quotationId} and companyId ${companyId}`,
    );
    return this.supabase.client
      .from('payments')
      .delete()
      .eq('quotation_id', quotationId);
  }
}
