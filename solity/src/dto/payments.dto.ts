export interface Payment {
  id: string;
  quotation_id: string;
  payment_number: number;
  amount: number;
  due_date: string;
  status: string;
  paid_date?: string;
  payment_type: string;
  payment_method?: string;
  notes?: string;
  quotations?: {
    quotation_number: string;
    client_name: string;
    event_date: string;
    total_amount: number;
    requires_invoice: boolean;
    has_contract: boolean;
  };
}
