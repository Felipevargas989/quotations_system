import { Quotation } from "./quotations.types";

export interface Refund {
  id: string;
  amount: number;
  quotation_id: Quotation["id"];
  is_paid: boolean;
}
