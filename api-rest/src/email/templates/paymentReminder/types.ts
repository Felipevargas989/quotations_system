/**
 * Payment reminder email template parameters
 */
export interface PaymentReminderParams {
  clientName: string;
  companyName: string;
  quotationId: string;
  payment: {
    payment_number: number;
    amount: number;
    due_date: Date;
  };
}
