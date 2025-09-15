import { Quotation } from 'src/quotations/entities/quotation.entity';
import { UpdatePaymentTransactionDto } from '../dto/update-payment-transaction.dto';
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

export type UpdatePaymentTransaction = UpdatePaymentTransactionDto & {
  payment_transaction_id: PaymentTransaction['id'];
};
