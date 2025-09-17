import { Client } from "./clients.types";

export enum QuotationRequestType {
  REQUERIMIENTO = "requerimiento",
  COTIZACION = "cotizacion",
}

export enum QuotationStatus {
  SOLICITADA = "solicitada",
  ENVIADA = "enviada",
  EN_NEGOCIACION = "en_negociacion",
  ACEPTADA = "aceptada",
  RECHAZADA = "rechazada",
}

export enum PaymentPlanType {
  CONTADO = "contado",
  DEFAULT = "default",
  THREE_PAYMENTS = "three_payments",
  CUSTOM = "custom",
}

export type BaseService = {
  codigo: string;
  nombre: string;
  precio: number;
  quantity: number;
  categoria: string;
};

export type FixedService = BaseService & {
  max_precio: number;
  min_precio: number;
  tipo_calculo: string;
  precio_por_persona: number;
};

export type VariableService = {
  category: string;
  items: BaseService[];
};

export type QuotationItem = {
  fixed_services: FixedService[];
  variable_services: VariableService[];
};

// Define enums to define the quotation event type
export enum EventType {
  ALMUERZO_O_CENA = "Almuerzo o Cena",
  PASEO_DE_CURSO = "Paseo de Curso",
  USO_SALONES = "Uso salones",
  ESTADIA_Y_ALIMENTACION = "Estadía y Alimentación",
  PASEO_FIN_DE_ANIO = "Paseo fin de año",
  CELEBRACIONES = "Celebraciones",
  MATRIMONIOS = "Matrimonios",
  GRADUACION = "Graduación",
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
  request_type: QuotationRequestType;
  updated_at: Date;
  requires_invoice: boolean;
  has_contract: boolean;
  payment_plan_type: PaymentPlanType;
  discount_percentage: number;
  subtotal_amount: number;
  items: QuotationItem;
  company_id: number;
}

export interface QuotationFormData
  extends Pick<
    Quotation,
    | "client_id"
    | "event_type"
    | "event_date"
    | "people_count"
    | "observations"
    | "request_type"
    | "quotation_status"
    | "subtotal_amount"
    | "discount_percentage"
    | "total_amount"
    | "value_per_person"
    | "fixed_value"
    | "items"
  > {
  has_contract?: Quotation["has_contract"];
  requires_invoice?: Quotation["requires_invoice"];
}

export interface QuotationFormDataUpdate extends Partial<QuotationFormData> {}

export interface QuotationWithClient extends Quotation {
  clients: Client;
}
