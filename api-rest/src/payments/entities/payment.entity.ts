export class Payment {
  id: string;
  quotation_id: string;
  payment_number: number;
  amount: number;
  due_date: Date;
  // TODO: check if necessary now bcs the payment_transactino contains that info
  paid_date?: Date;
  // TODO: add status enum
  status: string;
  // TODO: add payment_type enum
  // TODO: check if necessary now bcs the payment_transactino contains that info
  payment_type?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  // TODO: add payment_method enum
  // TODO: check if necessary now bcs the payment_transactino contains that info
  payment_method?: string;
}
export class PaymentTransaction {
  id: string;
  payment_id: string;
  quotation_id: string;
  amount: number;
  payment_method: string;
  transaction_date: string;
  notes?: string;
  created_by: string;
  created_at: string;
  receipt_photo_url?: string;
}
