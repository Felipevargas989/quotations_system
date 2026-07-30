export type QuotationFollowUpParams = {
  clientName: string;
  companyName: string;
  quotationNumber: number;
  eventType?: string | null;
  eventDate?: string | null;
  /** Toque 1 (día 7) o toque 2 (día 14). */
  toque: 1 | 2;
};
