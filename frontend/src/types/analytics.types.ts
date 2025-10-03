export type DashboardStatsResponse = {
  totalQuotations: number;
  totalClients: number;
  totalQuotationsByMonth: Record<string, number>;
  totalQuotationsByStatus: Record<string, { count: number; amount: number }>;
  totalQuotationsByEventDate: Record<string, { count: number; amount: number }>;
  totalPaymentsByMonth: Record<string, number>;
};
