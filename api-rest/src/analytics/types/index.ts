export type DashboardStatsResponse = {
  totalQuotations: number;
  totalClients: number;
  totalQuotationsByMonth: { month: string; count: number };
  totalQuotationsByStatus: { status: string; count: number; amount: number };
  totalQuotationsByEventDate: { date: string; count: number };
};
