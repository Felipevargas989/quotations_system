import { Quotation } from 'src/quotations/entities/quotation.entity';

export class Refund {
  id: string;
  amount: number;
  quotation_id: Quotation['id'];
  is_paid: boolean;
  // Solo en los registrados (20-10-2026: cada registro nace pagado).
  refund_date?: string | null;
  payment_method?: string | null;
  receipt_url?: string | null;
}
