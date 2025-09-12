import { Quotation } from '../entities/quotation.entity';

export type CreateQuotation = Omit<
  Quotation,
  'id' | 'created_at' | 'updated_at'
>;
