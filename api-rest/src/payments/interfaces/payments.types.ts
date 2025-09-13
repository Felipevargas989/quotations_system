import { Quotation } from 'src/quotations/entities/quotation.entity';
import { Payment, PaymentTransaction } from '../entities/payment.entity';

export type PaymentWithTransactionsAndQuotation = Payment & {
  quotations: Quotation[];
  payment_transactions: PaymentTransaction[];
};
