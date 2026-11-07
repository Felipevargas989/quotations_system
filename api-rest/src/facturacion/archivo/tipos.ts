import type { Montos } from './montos';

/**
 * LO QUE ENTRA A LOS ARMADORES DEL ARCHIVO (doc 19 §5.3)
 *
 * Los armadores son funciones puras: reciben los datos ya decididos (por
 * BelIA y confirmados por la persona) y devuelven el archivo plano que se
 * manda a facturacion.cl, o la lista de lo que falta. No leen la base ni
 * llaman a nadie.
 */

/** A quién va el documento, tal como se manda. */
export interface Receptor {
  rut: string;
  razon_social: string;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  /** Uno o varios, separados por coma: facturacion.cl le manda el
   *  documento a todos. Vacío = no se manda por correo. */
  correo?: string | null;
}

export interface LineaDeDetalle {
  /** La glosa de la línea (80 caracteres). */
  descripcion: string;
  /** El detalle largo, opcional (1.000 caracteres). */
  descripcionLarga?: string | null;
  cantidad: number;
  /** El precio unitario: NETO en la factura y las notas, CON IVA en la
   *  boleta. */
  precio: number;
  /** El descuento de la línea en %, de 0 a menos de 100 (la factura,
   *  doc 19 §9.22): va en PorcDescto y su monto en ValorDescto. */
  descuento?: number | null;
  /** El código del ítem (35); sin código va «SERV». */
  codigo?: string | null;
  /** La unidad (4); sin unidad va «UN». */
  unidad?: string | null;
}

/** Una línea de referencia del documento. */
export interface ReferenciaDelDocumento {
  /** '801' orden de compra, '802' nota de pedido, '803' contrato, '805' y
   *  '806' ChileCompra, 'HES', o el tipo del documento que la nota modifica
   *  ('33', '39', '56', '61'). */
  tipo: string;
  /** El N° tal cual (en la OC, solo el número: lo piden así clientes como
   *  Santo Tomás). Hasta 18 caracteres. */
  folio: string;
  /** La fecha del documento referenciado, AAAA-MM-DD. */
  fecha: string;
  /** 0 informativa (OC y las demás); 1 anula; 2 corrige texto; 3 corrige
   *  montos. */
  codigo?: 0 | 1 | 2 | 3;
  razon?: string | null;
}

/** Lo que devuelve un armador: el archivo listo, o lo que falta. */
export type Armado =
  | { ok: true; archivo: string; montos: Montos; avisos: string[] }
  | { ok: false; problemas: string[] };
