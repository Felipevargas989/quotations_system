import { SetMetadata } from '@nestjs/common';

// DE QUÉ EVENTO ES CADA PUERTA DE POST-VENTA (doc 22 §9, tanda 2; Felipe,
// 05-11-2026: "Todo debería mirar el tipo"). Con un tipo de cliente
// apagado, los eventos de ese tipo no aparecen: `TipoDelEventoGuard` lee
// esta marca, busca la cotización y le pregunta a `AlcanceDeRecepcion` si
// el cargo la ve. Las listas de toda la empresa no llevan marca: se
// filtran en su controlador (`AlcanceDeRecepcion.soloLasQueVe`).
export const DEL_EVENTO_KEY = 'delEvento';

/** Las tablas cuyas filas son de un evento (todas tienen `quotation_id`). */
export const TABLAS_DEL_EVENTO = [
  'payments',
  'payment_transactions',
  'refunds',
  'portal_receipts',
  'event_documents',
  'quotation_followups',
  'event_resources',
  'event_staff',
  'event_kitchen_notes',
] as const;

export type TablaDelEvento = (typeof TABLAS_DEL_EVENTO)[number];

/** Dónde viene la cotización del evento. */
export type DondeEstaElEvento =
  /** En la ruta: `/quotations/:id/realizado`. */
  | { param: string }
  /** En la consulta: `?quotationId=`. */
  | { query: string }
  /** En el cuerpo: un id o una lista de ids. */
  | { body: string }
  /** En cada fila de una lista del cuerpo: `rows[].quotation_id`. */
  | { filas: string; campo: string }
  /** En una fila de otra tabla, por el id de la ruta: un pago, un abono… */
  | { tabla: TablaDelEvento; param: string };

export const DelEvento = (donde: DondeEstaElEvento) =>
  SetMetadata(DEL_EVENTO_KEY, donde);
