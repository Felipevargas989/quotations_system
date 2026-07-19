// Define enums to define the quotation event type
export enum EventType {
  ALMUERZO_O_CENA = 'Almuerzo o Cena',
  PASEO_DE_CURSO = 'Paseo de Curso',
  USO_SALONES = 'Uso salones',
  ESTADIA_Y_ALIMENTACION = 'Estadía y Alimentación',
  PASEO_FIN_DE_ANIO = 'Paseo fin de año',
  CELEBRACIONES = 'Celebraciones',
  MATRIMONIOS = 'Matrimonios',
  GRADUACION = 'Graduación',
}

// Define enum to define the payment_plan_type
export enum PaymentPlanType {
  CONTADO = 'contado',
  DEFAULT = 'default',
  THREE_PAYMENTS = 'three_payments',
  CUSTOM = 'custom',
}

// Define enum to define the request_type
export enum RequestType {
  REQUERIMIENTO = 'requerimiento',
  COTIZACION = 'cotizacion',
}

export enum QuotationStatus {
  SOLICITADA = 'solicitada',
  ENVIADA = 'enviada',
  EN_NEGOCIACION = 'en_negociacion',
  ACEPTADA = 'aceptada',
  RECHAZADA = 'rechazada',
  // Evento aceptado que se anula: sale de Post-Venta/Compras pero conserva
  // su historia de pagos.
  CANCELADA = 'cancelada',
  // Evento que ya ocurrió: sigue en Post-Venta (cobranza) pero sale de
  // Compras/mobiliario. Al marcarse se envía la encuesta de satisfacción.
  REALIZADA = 'realizada',
}

export const STATUS_LABELS: Record<QuotationStatus, string> = {
  [QuotationStatus.SOLICITADA]: 'Solicitada',
  [QuotationStatus.ENVIADA]: 'Enviada',
  [QuotationStatus.EN_NEGOCIACION]: 'En negociación',
  [QuotationStatus.ACEPTADA]: 'Aceptada',
  [QuotationStatus.RECHAZADA]: 'Rechazada',
  [QuotationStatus.CANCELADA]: 'Cancelada',
  [QuotationStatus.REALIZADA]: 'Realizada',
};
