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

export type CompleteStatsResponse = {
  quotation_status_stats: QuotationStatusStats[];
  event_type_conversion_stats: EventTypeConversionStats;
  event_type_revenue_stats: EventTypeRevenueStats[];
  revenue_by_client_type: RevenueByClientType[];
};
