import { Client } from 'src/clients/entities/client.entity';
import { Company } from 'src/companies/entities/company.entity';
import {
  Payment,
  PaymentTransaction,
} from 'src/payments/entities/payment.entity';
import { Quotation } from '../entities/quotation.entity';

export type CreateQuotation = Omit<
  Quotation,
  'id' | 'created_at' | 'updated_at' | 'event_date' | 'user_id'
> & {
  event_date: string;
  user_id: string | undefined;
};

export type PaymentWithTransactionsAndQuotation = Payment & {
  quotations: Quotation[];
  payment_transactions: PaymentTransaction[];
};

export type QuotationWithClientAndCompany = Quotation & {
  clients: Pick<Client, 'name' | 'email'>;
  companies: Pick<Company, 'name'>;
};
