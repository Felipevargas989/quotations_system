import type { FechasDeLaCotizacion } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatFechaEvento } from "../../utils/dates";

// Lo que calcula «¿Calza el precio?» (decisión 29 del doc 17, 19-10), aparte
// del componente para que la pantalla se recargue sola al editarla.

export const claveDeLaCotizacion = (oportunidadId: number) => [
  "oportunidades",
  "cotizacion",
  oportunidadId,
];

const pesos = (n: number) => formatCurrency(n, "CLP");

export const porcentaje = (parte: number, todo: number) =>
  todo > 0
    ? `${(Math.round((parte / todo) * 1000) / 10).toLocaleString("es-CL")} %`
    : "";

/** Lo que dice el panel de la cotización frente a la oferta (decisión 69):
 *  si cuadra, si le falta (lo que se subcontrata o no está en el catálogo)
 *  o si sobra. null sin cotización o sin oferta. */
export function cuadre(
  oferta: number,
  cotizacion: number | null,
): { tono: "calza" | "falta" | "sobra"; texto: string } | null {
  if (cotizacion === null || oferta <= 0) return null;
  const diferencia = oferta - cotizacion;
  if (diferencia === 0) {
    return { tono: "calza", texto: "Tu cotización cuadra con tu oferta." };
  }
  if (diferencia > 0) {
    return {
      tono: "falta",
      texto: `A tu cotización le faltan ${pesos(diferencia)} para llegar a tu oferta: es lo que se subcontrata o no está en tu catálogo (abajo). Agrégalo a la cotización como servicio para cuadrar, o déjalo como diferencia.`,
    };
  }
  return {
    tono: "sobra",
    texto: `Tu cotización suma ${pesos(-diferencia)} más que tu oferta: ajusta su descuento o reescríbela con lo postulado.`,
  };
}

/** Lo que dice el panel sobre la oferta frente al presupuesto. */
export function veredicto(
  presupuesto: number | null,
  oferta: number,
): { tono: "calza" | "se_pasa"; texto: string } | null {
  if (!presupuesto || oferta <= 0) return null;
  if (oferta <= presupuesto) {
    return {
      tono: "calza",
      texto: `Calza: tu oferta queda ${porcentaje(presupuesto - oferta, presupuesto)} bajo el presupuesto (${pesos(presupuesto - oferta)}).`,
    };
  }
  return {
    tono: "se_pasa",
    texto: `Se pasa del presupuesto por ${pesos(oferta - presupuesto)}: una oferta sobre el presupuesto suele quedar fuera.`,
  };
}

/** Las fechas de las bases en palabras (decisión 73, 23-10; Felipe: "el
 *  crear cotización pregunta los días, pero no debería leer las bases para
 *  saber si es por día?"): un día, «jueves 26 de noviembre»; varios, «del
 *  viernes 6 de noviembre al domingo 8 de noviembre». null sin fecha. */
export function fechasEnPalabras(
  f: FechasDeLaCotizacion | null | undefined,
): { unDia: boolean; texto: string } | null {
  if (!f?.desde) return null;
  const dia = (iso: string) => formatFechaEvento(iso, "diaYMes");
  return !f.hasta || f.hasta === f.desde
    ? { unDia: true, texto: dia(f.desde) }
    : { unDia: false, texto: `del ${dia(f.desde)} al ${dia(f.hasta)}` };
}
