import { sumarDias } from '../../quotations/generar/fechas';

/**
 * CÓMO SE PAGA LA FACTURA (doc 19 §9.22 y §9.43). Salió de `borrador.ts` el
 * 09-11, cuando el borrador llegó a las 800 líneas del portero.
 *
 * - La condición de pago: contado, o crédito a 30, 45 o 60 días con su
 *   vencimiento.
 * - El medio de pago (§9.43, Felipe 09-11: *"cierre de caja"*): al contado,
 *   con qué pagó (efectivo, débito, crédito o transferencia), para cuadrar
 *   la caja de recepción. Es de Eventia: no va en el archivo del SII.
 */

/** 1 contado (no queda por cobrar) y 2 crédito (§9.22). */
export type FormaDePago = 1 | 2;

/** Los plazos del crédito: 30 días es el máximo de la ley de pago a 30
 *  días (Ley 19.983); 45 y 60, con bases de licitación o un acuerdo
 *  inscrito en el Ministerio de Economía (§9.22). */
export const PLAZOS_DE_PAGO = [30, 45, 60] as const;
export const PLAZO_POR_DEFECTO = 30;

/**
 * Con qué se pagó al contado (§9.43).
 * ⚠ GEMELO: viven también en `frontend/src/constants/facturacion.ts`. Si se
 *   cambian acá, se cambian allá.
 */
export const MEDIOS_DE_PAGO = [
  'efectivo',
  'debito',
  'credito',
  'transferencia',
] as const;
export type MedioDePago = (typeof MEDIOS_DE_PAGO)[number];

/** La condición de pago como va en la factura: contado, o crédito con su
 *  vencimiento desde la emisión. */
export interface PagoDeLaFactura {
  forma: FormaDePago;
  dias: number | null;
  vencimiento: string | null;
}

export const pagoDe = (
  p: { forma_de_pago?: FormaDePago | null; plazo_dias?: number | null },
  fecha: string,
): PagoDeLaFactura => {
  if (p.forma_de_pago === 1) return { forma: 1, dias: null, vencimiento: null };
  const dias = p.plazo_dias ?? PLAZO_POR_DEFECTO;
  return { forma: 2, dias, vencimiento: sumarDias(fecha, dias) };
};
