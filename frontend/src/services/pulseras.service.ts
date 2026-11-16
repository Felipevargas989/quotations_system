import { apiRequest } from "./api";

/**
 * LAS PULSERAS DE RECEPCIÓN (doc 19 §9.49). Operaciones o el administrador
 * se las entregan a recepción; recepción las cuenta a ciegas al cerrar la
 * caja. Entregadas − vendidas = deberían quedar, contra lo contado.
 */

const base = "/facturacion/pulseras";

export interface CierreConPulseras {
  id: number;
  abierta_en: string;
  cerrada_en: string | null;
  abierta_por_nombre: string;
  cerrada_por_nombre: string | null;
  entregadas: number;
  vendidas: number;
  /** Nulo si ese cierre no contó (nulo no es cero). */
  deberian: number | null;
  contadas: number | null;
  /** Contadas − deberían: negativa, faltan. */
  diferencia: number | null;
}

export interface ResumenDePulseras {
  /** Si la empresa tiene ítems del tarifario con «Usa pulsera». */
  usa_pulsera: boolean;
  entregadas: number;
  vendidas: number;
  deberian_quedar: number;
  /** El último conteo; nulo antes del primero. */
  contadas: number | null;
  contadas_en: string | null;
  diferencia: number | null;
  /** Lo emitido directo por operaciones o el administrador en «Nuevo
   *  DTE» (sin solicitud): también descuenta; va en el movimiento. */
  ventas_directas: { created_at: string; pulseras: number }[];
  turnos: CierreConPulseras[];
  entregas: { id: number; cantidad: number; creada_en: string; por: string }[];
}

export const getPulseras = async (): Promise<ResumenDePulseras> =>
  (await apiRequest(base, "GET")) as ResumenDePulseras;

/** Quién y cuándo salen de la sesión. */
export const entregarPulseras = async (
  cantidad: number,
): Promise<ResumenDePulseras> =>
  (await apiRequest(`${base}/entregas`, "POST", {
    cantidad,
  })) as ResumenDePulseras;
