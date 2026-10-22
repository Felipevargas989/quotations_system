import type {
  DetalleMp,
  TipoProceso,
} from "../../services/oportunidades.service";

// COMPRAS ÁGILES Y LICITACIONES (Felipe, 17-10: "¿las compras ágiles están
// funcionando? no veo ninguna... sello compra ágil / sello licitación").
// Aparte de oportunidades.utils.ts, que ya pasa las 800 líneas (portero de
// la casa): lo nuevo va en su propio archivo.

/** El sello de cada tipo, en la fila, el resumen, «Mis licitaciones» y la
 *  ficha (Felipe, 17-10: "sello compra ágil / sello licitación"). Colores
 *  que no se confunden con el semáforo. */
export const SELLO_DEL_TIPO: Record<TipoProceso, string> = {
  licitacion: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
  compra_agil: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
};

/** Mientras el motor trae el detalle de una compra ágil, la ficha vuelve
 *  a preguntar cada 4 segundos (decisión 20). */
export const preguntarDeNuevo = (
  detalle: DetalleMp | undefined,
): number | false => (detalle === "trayendo" ? 4000 : false);

export const TEXTO_DEL_DETALLE_MP: Record<
  "trayendo" | "no_disponible",
  string
> = {
  trayendo: "Trayendo la descripción y los productos desde Mercado Público…",
  no_disponible:
    "Mercado Público no entregó el detalle de esta compra ágil: ábrela allá.",
};
