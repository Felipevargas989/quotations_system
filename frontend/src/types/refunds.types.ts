import { Quotation } from "./quotations.types";

export interface Refund {
  id: string;
  amount: number;
  quotation_id: Quotation["id"];
  is_paid: boolean;
  created_at?: string;
  refund_date?: string | null;
  payment_method?: string | null;
  receipt_url?: string | null;
}
