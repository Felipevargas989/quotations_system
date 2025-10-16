import {
  Payment,
  PaymentTransaction,
} from 'src/payments/entities/payment.entity';
import { Quotation } from '../entities/quotation.entity';

export type CreateQuotation = Omit<
  Quotation,
  'id' | 'created_at' | 'updated_at' | 'event_date'
> & {
  event_date: string;
};

export type PaymentWithTransactionsAndQuotation = Payment & {
  quotations: Quotation[];
  payment_transactions: PaymentTransaction[];
};
