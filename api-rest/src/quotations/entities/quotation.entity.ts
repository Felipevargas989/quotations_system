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
  // Niños dentro del total (people_count = adultos + niños).
  children_count?: number;
  // Propina % sobre variables, post-IVA (null = sin propina).
  tip_percentage?: number | null;
  // Monto de la propina en pesos (migración 37). El porcentaje es la
  // regla; esto es el hecho, y queda fijo. Ver quotations/utils/tip.ts.
  tip_amount?: number | null;
  // Persona de contacto del evento (texto libre).
  contact_name?: string | null;
  // Enlace secreto del portal del cliente (migración 47): nace al
  // aceptar la cotización. 64 hex = imposible de adivinar.
  portal_token?: string | null;
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
