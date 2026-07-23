export type DashboardStatsResponse = {
  totalQuotations: number;
  totalClients: number;
  totalQuotationsByMonth: Record<string, number>;
  totalQuotationsByStatus: Record<string, { count: number; amount: number }>;
  totalQuotationsByEventDate: Record<string, { count: number; amount: number }>;
  totalPaymentsByMonth: Record<string, number>;
  // FASE 3 (23-07): cobrado vs por cobrar por mes (tabla de ingresos).
  totalPaymentsDetailByMonth?: Record<
    string,
    { cobrado: number; porCobrar: number }
  >;
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

// Top por N° de cotizaciones (23-07): quién hace trabajar más al equipo,
// cuántas se concretaron (aceptada/realizada) y la tasa de concreción.
export type TopClientsByQuotations = {
  client_id: string;
  client_name: string;
  client_type: string;
  total_quotations: number;
  won_quotations: number;
  conversion_rate: number;
};

// Clientes recurrentes (23-07): 2+ eventos concretados en el período.
export type RecurringClient = {
  client_id: string;
  client_name: string;
  client_type: string;
  won_events: number;
  total_revenue: number;
};

export type CompleteStatsResponse = {
  quotation_status_stats: QuotationStatusStats[];
  event_type_conversion_stats: EventTypeConversionStats[];
  event_type_revenue_stats: EventTypeRevenueStats[];
  revenue_by_client_type: RevenueByClientType[];
  top_clients_by_revenue: TopClientsByRevenue[];
  variable_services_usage: VariableServiceUsage[];
  fixed_services_usage: FixedServiceUsage[];
  top_clients_by_quotations: TopClientsByQuotations[];
  recurring_clients: RecurringClient[];
};
