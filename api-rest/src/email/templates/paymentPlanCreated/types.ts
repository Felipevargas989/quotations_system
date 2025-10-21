export type PaymentPlanCreatedParams = {
  clientName: string;
  companyName: string;
  quotationNumber: number;
  payments: {
    payment_number: number;
    amount: number;
    due_date: Date | string;
  }[];
};
