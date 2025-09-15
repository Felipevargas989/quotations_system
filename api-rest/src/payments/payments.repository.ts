import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UpdatePaymentTransactionDto } from './dto/update-payment-transaction.dto';
import { Payment, PaymentTransaction } from './entities/payment.entity';
import {
  CreatePaymentTransaction,
  PaymentWithTransactionsAndQuotation,
  UpdatePayment,
} from './interfaces/payments.types';

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
        notes,
        payment_method,
        receipt_photo_url,
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

  async findPaymentById(
    paymentId: Payment['id'],
    companyId: Company['id'],
  ): Promise<{
    data: Payment | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `findPaymentById with paymentId ${paymentId} and companyId ${companyId}`,
    );
    return this.supabase.client
      .from('payments')
      .select('*, quotations!inner (company_id)')
      .eq('id', paymentId)
      .eq('quotations.company_id', companyId)
      .single();
  }

  async findAllTransactionsByPaymentId(paymentId: Payment['id']) {
    this.logger.info(
      `findAllTransactionsByPaymentId with paymentId ${paymentId}`,
    );
    return this.supabase.client
      .from('payment_transactions')
      .select('*')
      .eq('payment_id', paymentId);
  }

  async createPaymentTransaction(paymentTransaction: CreatePaymentTransaction) {
    this.logger.info(
      `createPaymentTransaction with paymentTransaction ${JSON.stringify(paymentTransaction)}`,
    );
    return this.supabase.client
      .from('payment_transactions')
      .insert(paymentTransaction);
  }

  async updatePayment(paymentId: Payment['id'], updatePayment: UpdatePayment) {
    this.logger.info(
      `updatePayment with paymentId ${paymentId} and status ${JSON.stringify(updatePayment)}`,
    );
    return this.supabase.client
      .from('payments')
      .update(updatePayment)
      .eq('id', paymentId);
  }

  async updatePaymentTransaction(
    paymentTransactionId: PaymentTransaction['id'],
    updatePaymentTransaction: UpdatePaymentTransactionDto,
  ) {
    this.logger.info(
      `updatePaymentTransaction with paymentTransactionId ${paymentTransactionId} and updatePaymentTransaction ${JSON.stringify(updatePaymentTransaction)}`,
    );
    return this.supabase.client
      .from('payment_transactions')
      .update(updatePaymentTransaction)
      .eq('id', paymentTransactionId);
  }

  async findPaymentTransactionById(
    paymentTransactionId: PaymentTransaction['id'],
  ): Promise<{
    data: PaymentTransaction | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `findPaymentTransactionById with paymentTransactionId ${paymentTransactionId}`,
    );
    return this.supabase.client
      .from('payment_transactions')
      .select('*')
      .eq('id', paymentTransactionId)
      .single();
  }

  async removePaymentTransaction(
    paymentTransactionId: PaymentTransaction['id'],
  ) {
    this.logger.info(
      `removePaymentTransaction with paymentTransactionId ${paymentTransactionId}`,
    );
    return this.supabase.client
      .from('payment_transactions')
      .delete()
      .eq('id', paymentTransactionId);
  }

  async removePayment(paymentId: Payment['id']) {
    this.logger.info(`removePayment with paymentId ${paymentId}`);
    return this.supabase.client.from('payments').delete().eq('id', paymentId);
  }

  async removePaymentTransactionsByPaymentId(paymentId: Payment['id']) {
    this.logger.info(
      `removePaymentTransactionsByPaymentId with paymentId ${paymentId}`,
    );
    return this.supabase.client
      .from('payment_transactions')
      .delete()
      .eq('payment_id', paymentId);
  }
}
