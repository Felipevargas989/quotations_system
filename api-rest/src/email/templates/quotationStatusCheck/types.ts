import { QuotationStatus } from 'src/quotations/constants/constants';

export type QuotationStatusCheckParams = {
  companyId: number;
  companyName?: string;
  totalQuotations: number;
  statusCounts: Partial<Record<QuotationStatus, number>>;
};
