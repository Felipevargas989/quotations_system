import {
  EventType,
  PaymentPlanType,
  QuotationStatus,
  RequestType,
} from '../constants/constants';

// TODO: define structure
export interface QuotationItem {
  id: string;
}
export interface Quotation {
  id: string;
  quotation_number: number;
  user_id: string;
  total_amount: number;
  people_count: number;
  quotation_status: QuotationStatus;
  observations?: string;
  created_at: Date;
  client_id: string;
  event_type: EventType;
  event_date: Date;
  value_per_person: number;
  fixed_value: number;
  request_type: RequestType;
  updated_at: Date;
  requires_invoice: boolean;
  has_contract: boolean;
  payment_plan_type: PaymentPlanType;
  discount_percentage: number;
  subtotal_amount: number;
  items: QuotationItem[];
  company_id: number;
}
