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

export type EventTypeRevenueStats = {
  event_type: string;
  total_events: number;
  total_revenue: number;
  revenue_percentage: number;
};

export type RevenueByClientType = {
  client_type: string;
  total_quotations: number;
  total_revenue: number;
  revenue_percentage: number;
};

export type TopClientsByRevenue = {
  client_id: string;
  client_name: string;
  client_type: string;
  total_revenue: number;
};

export type VariableServiceUsage = {
  service_name: string;
  usage_count: number;
};

export type FixedServiceUsage = {
  service_name: string;
  usage_count: number;
};

export type CompleteStatsResponse = {
  quotation_status_stats: QuotationStatusStats[];
  event_type_conversion_stats: EventTypeConversionStats[];
  event_type_revenue_stats: EventTypeRevenueStats[];
  revenue_by_client_type: RevenueByClientType[];
  top_clients_by_revenue: TopClientsByRevenue[];
  variable_services_usage: VariableServiceUsage[];
  fixed_services_usage: FixedServiceUsage[];
};
