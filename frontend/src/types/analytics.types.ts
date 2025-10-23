export type DashboardStatsResponse = {
  totalQuotations: number;
  totalClients: number;
  totalQuotationsByMonth: Record<string, number>;
  totalQuotationsByStatus: Record<string, { count: number; amount: number }>;
  totalQuotationsByEventDate: Record<string, { count: number; amount: number }>;
  totalPaymentsByMonth: Record<string, number>;
};

export type QuotationStatusStats = {
  quotation_status: string;
  total: number;
  percentage: number;
};

export type EventTypeConversionStats = {
  event_type: string;
  total_quotations: number;
  accepted_quotations: number;
  conversion_rate_percentage: number;
};

export type CompleteStatsResponse = {
  quotation_status_stats: QuotationStatusStats[];
  event_type_conversion_stats: EventTypeConversionStats[];
};
