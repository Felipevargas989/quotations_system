export interface QuotationDayStats {
  date: string; // Format: YYYY-MM-DD
  count: number;
  total_amount: number;
}

export interface QuotationStatsResponse {
  period: string; // e.g., "2024-01" for January 2024
  companies: {
    company_id: number;
    company_name: string;
    stats: QuotationDayStats[];
    total_quotations: number;
    total_amount: number;
  }[];
  total_quotations: QuotationDayStats[];
  total_quotations_all_companies: number;
  total_amount_all_companies: number;
}
