import type { GeneracionesDeOportunidad } from "../../services/oportunidades.service";

// LAS LICITACIONES POSTULADAS ANTES DE «ARMAR POSTULACIÓN» (26-10). Felipe,
// con la 1532886-5-LE26, postulada la mañana del 19-10: "no me está
// reconociendo mi oferta" y "no está el desplegable del proveedor". Esas no
// tienen oferta armada (decisión 35, de esa misma tarde): el precio quedó en
// los anexos (`monto_total`) y el pedido al proveedor, en sus pendientes
// («Subcontratar y cotizar: …»).

/** El precio con IVA con que se llenaron los anexos; null si no hay. */
export const precioDeLosAnexos = (
  g: GeneracionesDeOportunidad | null | undefined,
): number | null => {
  const n = g?.anexos?.parametros?.monto_total;
  return typeof n === "number" && n > 0 ? n : null;
};

/** El pedido al proveedor que dejaron los anexos o la propuesta en sus
 *  pendientes: «Subcontratar y cotizar: audiovisual (a, b), escenarios, …»,
 *  partido por las comas que no están entre paréntesis. */
export const pedidoDeLosAnexos = (
  g: GeneracionesDeOportunidad | null | undefined,
): string[] => {
  const lineas = [g?.anexos, g?.propuesta].flatMap((x) =>
    x?.estado === "listo" ? (x.resultado?.pendientes ?? []) : [],
  );
  const cosas: string[] = [];
  for (const linea of lineas) {
    const m = /^\s*subcontratar(?:\s+y\s+cotizar)?\s*:\s*(.+)$/i.exec(linea);
    if (!m) continue;
    let nivel = 0;
    let actual = "";
    for (const letra of m[1].replace(/\.\s*$/, "")) {
      if (letra === "(") nivel += 1;
      if (letra === ")") nivel = Math.max(0, nivel - 1);
      if (letra === "," && nivel === 0) {
        cosas.push(actual);
        actual = "";
        continue;
      }
      actual += letra;
    }
    cosas.push(actual);
  }
  return [
    ...new Set(
      cosas
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => c[0].toUpperCase() + c.slice(1)),
    ),
  ];
};
