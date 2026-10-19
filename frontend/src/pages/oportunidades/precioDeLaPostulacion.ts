import { formatCurrency } from "../../utils/currencies";

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
