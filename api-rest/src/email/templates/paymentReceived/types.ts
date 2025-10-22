export type PaymentReceivedParams = {
  clientName: string;
  companyName: string;
  amount: number;
  paymentMethod: string;
  transactionDate: Date | string;
};
