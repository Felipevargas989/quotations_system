import { Client } from 'src/clients/entities/client.entity';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { UpdatePaymentTransactionDto } from '../dto/update-payment-transaction.dto';
import { Payment, PaymentTransaction } from '../entities/payment.entity';

export type PaymentWithTransactionsAndQuotation = Payment & {
  quotations: Quotation & { clients: Pick<Client, 'name' | 'email'> } & {
    companies: Pick<Company, 'name'>;
  } & {
    /** Mandante vinculado (migración 48); trae el token del portal. */
    mandante?: {
      name: string;
      email: string | null;
      portal_token: string | null;
    } | null;
  };
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

export type CreatePayment = Omit<
  Payment,
  'id' | 'created_at' | 'updated_at' | 'payment_method'
>;
