import { Quotation } from 'src/quotations/entities/quotation.entity';
import { Payment, PaymentTransaction } from '../entities/payment.entity';

export type PaymentWithTransactionsAndQuotation = Payment & {
  quotations: Quotation[];
  payment_transactions: PaymentTransaction[];
};

export type CreatePaymentTransaction = Omit<
  PaymentTransaction,
  'id' | 'created_by'
>;

export type UpdatePayment = Partial<
  Omit<Payment, 'id' | 'created_at' | 'updated_at'>
>;
