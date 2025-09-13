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
}
