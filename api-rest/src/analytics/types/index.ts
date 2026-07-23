import { EventType, QuotationStatus } from 'src/quotations/constants/constants';

export type DashboardStatsResponse = {
  totalQuotations: number;
  totalClients: number;
  totalQuotationsByMonth: Record<string, number>;
  totalQuotationsByStatus: Record<string, { count: number; amount: number }>;
  totalQuotationsByEventDate: Record<string, { count: number; amount: number }>;
  totalPaymentsByMonth: Record<string, number>;
};

type QuotationStatusStats = {
  quotation_status: QuotationStatus;
  total: number;
  percentage: number;
};

type EventTypeConversionStats = {
  event_type: EventType;
  total_quotations: number;
  accepted_quotations: number;
  conversion_rate_percentage: number;
};

type EventTypeRevenueStats = {
  event_type: EventType;
  total_events: number;
  total_revenue: number;
  revenue_percentage: number;
};

type RevenueByClientType = {
  client_type: ClientTypes;
  total_quotations: number;
  total_revenue: number;
  revenue_percentage: number;
};

type TopClientsByRevenue = {
  client_id: string;
  client_name: string;
  client_type: ClientTypes;
  total_revenue: number;
};

type VariableServiceUsage = {
  service_name: string;
  usage_count: number;
};

type FixedServiceUsage = {
  service_name: string;
  usage_count: number;
};

// Top por N° de cotizaciones (23-07): quién hace trabajar más al equipo,
// con cuántas se concretaron (aceptada/realizada) y la tasa.
type TopClientsByQuotations = {
  client_id: string;
  client_name: string;
  client_type: ClientTypes;
  total_quotations: number;
  won_quotations: number;
  conversion_rate: number;
};

// Clientes recurrentes (23-07): 2+ eventos concretados en el período.
type RecurringClient = {
  client_id: string;
  client_name: string;
  client_type: ClientTypes;
  won_events: number;
  total_revenue: number;
};
export type CompleteStatsResponse = {
  quotation_status_stats: QuotationStatusStats[];
  event_type_conversion_stats: EventTypeConversionStats;
  event_type_revenue_stats: EventTypeRevenueStats[];
  revenue_by_client_type: RevenueByClientType[];
  top_clients_by_revenue: TopClientsByRevenue[];
  variable_services_usage: VariableServiceUsage[];
  fixed_services_usage: FixedServiceUsage[];
  top_clients_by_quotations: TopClientsByQuotations[];
  recurring_clients: RecurringClient[];
};
