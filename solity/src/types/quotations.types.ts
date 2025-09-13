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

export interface Quotation {
  id: string;
  quotation_number: number;
  // TODO: remove this field
  client_name: string;
  // TODO: remove this field
  client_email?: string;
  // TODO: remove this field
  phone?: string;
  event_type?: string;
  event_date?: string;
  people_count: number;
  subtotal_amount?: number;
  discount_percentage?: number;
  total_amount: number;
  quotation_status: QuotationStatus;
  request_type: QuotationRequestType;
  created_at: string;
  updated_at: string;
  observations?: string;
  value_per_person?: number;
  fixed_value?: number;
  user_id?: string;
  // TODO: this should be required
  client_id?: string;
  responsible_user?: string;
  items?: any; // JSON field containing variable_services and fixed_services
  requires_invoice?: boolean;
  has_contract?: boolean;
  payment_plan_type?: PaymentPlanType;
  company_id: number;
}

export interface QuotationFormData
  extends Omit<
    Quotation,
    "id" | "quotation_number" | "created_at" | "updated_at"
  > {}

export interface QuotationFormDataUpdate
  extends Omit<
    QuotationFormData,
    | "company_id"
    | "quotation_number"
    | "quotation_status"
    | "request_type"
    | "user_id"
    | "created_at"
    | "updated_at"
  > {}
