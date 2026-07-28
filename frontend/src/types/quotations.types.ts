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
  // Evento aceptado que se anula: sale de Post-Venta, Compras y mobiliario,
  // pero conserva su historia de pagos y comprobantes.
  CANCELADA = "cancelada",
  // Evento que ya ocurrió: sigue en Post-Venta (cobranza pendiente) pero
  // sale de Compras/mobiliario. Al marcarse se envía la encuesta.
  REALIZADA = "realizada",
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
  // Último día del evento (null/ausente = un solo día).
  event_end_date?: Date | null;
  // Niños dentro del total (people_count = adultos + niños; 0 = solo adultos).
  children_count?: number;
  // Propina % sobre variables, DESPUÉS del IVA (null/ausente = sin propina).
  tip_percentage?: number | null;
  // Monto de la propina en pesos (migración 37). El porcentaje es la
  // regla; esto es el hecho, y queda fijo. Ver utils/quotationMoney.
  tip_amount?: number | null;
  // Persona de contacto del evento (texto libre; puente a Etapa 4).
  contact_name?: string | null;
  value_per_person: number;
  fixed_value: number;
  request_type: QuotationRequestType;
  updated_at: Date;
  requires_invoice: boolean;
  has_contract: boolean;
  payment_plan_type: PaymentPlanType;
  discount_percentage: number;
  discount_amount: number;
  subtotal_amount: number;
  items: QuotationItem;
  company_id: number;
}

export interface QuotationFormData
  extends Pick<
    Quotation,
    | "client_id"
    | "event_type"
    | "people_count"
    | "observations"
    | "request_type"
    | "quotation_status"
    | "subtotal_amount"
    | "discount_percentage"
    | "discount_amount"
    | "total_amount"
    | "value_per_person"
    | "fixed_value"
    | "items"
  > {
  has_contract?: Quotation["has_contract"];
  requires_invoice?: Quotation["requires_invoice"];
  // En el formulario las fechas viajan como string yyyy-mm-dd (así las
  // entrega <input type="date">); el backend las convierte a UTC.
  // Antes decía Date y era mentira — Fase 2 Bloque C.
  event_date: string | undefined;
  // null = evento de un día.
  event_end_date?: string | null;
  // Cotizador 2.0: niños dentro del total y propina opcional post-IVA.
  children_count?: number;
  tip_percentage?: number | null;
  // El monto de la propina viaja junto al %: es el que ya está sumado
  // dentro de total_amount, y se guarda tal cual (migración 37).
  tip_amount?: number | null;
  contact_name?: string | null;
}

export type QuotationPublicFormData = Pick<
  Client,
  "name" | "email" | "phone" | "client_type"
> &
  Pick<Quotation, "event_type" | "people_count" | "observations"> & {
    // string yyyy-mm-dd, igual que en el formulario interno.
    event_date: string;
    children_count?: number;
  };

// Lo que viaja al backend al CREAR una cotización autenticada: un
// requerimiento va sin montos (el backend los deja en 0); el cotizador
// va completo. Por eso lo obligatorio es solo el esqueleto del evento.
export type QuotationCreateData = Partial<QuotationFormData> &
  Pick<
    QuotationFormData,
    | "client_id"
    | "event_type"
    | "people_count"
    | "request_type"
    | "quotation_status"
  >;

export interface QuotationFormDataUpdate extends Partial<QuotationFormData> {}

export interface QuotationWithClient extends Quotation {
  clients: Client;
}
