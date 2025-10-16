import { Quotation } from 'src/quotations/entities/quotation.entity';

export class Refund {
  id: string;
  amount: number;
  quotation_id: Quotation['id'];
  is_paid: boolean;
}
