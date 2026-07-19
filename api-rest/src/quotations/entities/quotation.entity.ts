import {
  EventType,
  PaymentPlanType,
  QuotationStatus,
  RequestType,
} from '../constants/constants';

type BaseService = {
  codigo: string;
  nombre: string;
  precio: number;
  quantity: number;
  categoria: string;
};

type FixedService = BaseService & {
  max_precio: number;
  min_precio: number;
  tipo_calculo: string;
  precio_por_persona: number;
};

type VariableService = {
  category: string;
  items: BaseService[];
};

export type QuotationItem = {
  fixed_services: FixedService[];
  variable_services: VariableService[];
};

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
  // Último día del evento (null = un solo día).
  event_end_date?: Date | null;
  value_per_person: number;
  fixed_value: number;
  request_type: RequestType;
  updated_at: Date;
  requires_invoice: boolean;
  has_contract: boolean;
  payment_plan_type: PaymentPlanType;
  discount_percentage: number;
  discount_amount?: number;
  subtotal_amount: number;
  items: QuotationItem;
  company_id: number;
}
