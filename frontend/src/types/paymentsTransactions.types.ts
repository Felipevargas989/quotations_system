export type PaymentTransaction = {
  id: string;
  payment_id: string;
  quotation_id: string;
  amount: number;
  payment_method: string;
  transaction_date: string;
  notes?: string;
  receipt_photo_url?: string;
};

export type CreatePaymentTransaction = Omit<
  PaymentTransaction,
  "id" | "created_at"
>;
