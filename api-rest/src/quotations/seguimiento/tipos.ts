// LO QUE RESPONDE LA IA AL ESCRIBIR UN SEGUIMIENTO (doc 18, sección 6).
//
// Sin nulos a propósito (vacío = "no hay"), igual que el plan de «Crear con
// IA»: la salida con estructura fija queda simple.

export type RespuestaDelSeguimiento = {
  accion: 'borrador' | 'saltar';
  /** Si salta, por qué, en una línea para el equipo. */
  motivo: string;
  /** Solo si el correo es nuevo (sin hilo). */
  asunto: string;
  /** El correo en párrafos <p>, sin despedida ni firma. */
  cuerpo_html: string;
  /** El ángulo en pocas palabras, para la bitácora. */
  angulo: string;
};

/** La forma exacta de RespuestaDelSeguimiento para la salida fija. */
export const ESQUEMA_DEL_SEGUIMIENTO = {
  type: 'object',
  properties: {
    accion: { type: 'string', enum: ['borrador', 'saltar'] },
    motivo: { type: 'string' },
    asunto: { type: 'string' },
    cuerpo_html: { type: 'string' },
    angulo: { type: 'string' },
  },
  required: ['accion', 'motivo', 'asunto', 'cuerpo_html', 'angulo'],
  additionalProperties: false,
} as const;
