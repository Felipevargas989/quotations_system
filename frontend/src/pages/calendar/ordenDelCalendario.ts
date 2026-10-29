import { QuotationStatus } from "../../types/quotations.types";

/**
 * LO VENDIDO PRIMERO (Felipe, 28-10-2026: "el calendario puede mostrar
 * primero lo aceptado tanto en el resumen como en el calendario"). Lo
 * aceptado y lo realizado —que en los días pasados es lo que estuvo
 * aceptado— va arriba en el panel del día y toma las primeras filas de
 * bandas, así nunca queda escondido en «+N más» detrás de lo que sigue en
 * juego. Dentro de cada grupo se respeta el orden de antes.
 */
const VENDIDO = new Set<string>([
  QuotationStatus.ACEPTADA,
  QuotationStatus.REALIZADA,
]);

export const esVendido = (estado: string) => VENDIDO.has(estado);

/** El panel del día: lo vendido arriba, cada grupo en el orden que traía. */
export const loVendidoPrimero = <T extends { quotation_status: string }>(
  eventos: T[],
): T[] => [
  ...eventos.filter((q) => esVendido(q.quotation_status)),
  ...eventos.filter((q) => !esVendido(q.quotation_status)),
];

/** Un evento en el calendario: su rango en texto aaaa-mm-dd. */
export type TramoDelEvento = {
  id: string;
  start: string;
  end: string;
  vendido: boolean;
};

/**
 * Filas de bandas (pistas) para que los eventos que se topan no se pisen:
 * cada evento toma la primera fila libre en todo su rango. Primero se
 * reparten los vendidos y después el resto, que aprovecha los huecos que
 * quedaron. Dentro de cada grupo, como hasta el 28-10-2026: el que empieza
 * antes y, si empiezan el mismo día, el más largo.
 */
export const asignarPistas = (
  tramos: TramoDelEvento[],
): Map<string, number> => {
  const orden = [...tramos].sort((a, b) => {
    if (a.vendido !== b.vendido) return a.vendido ? -1 : 1;
    return a.start === b.start
      ? b.end.localeCompare(a.end)
      : a.start.localeCompare(b.start);
  });
  const pistas: TramoDelEvento[][] = [];
  const mapa = new Map<string, number>();
  for (const tramo of orden) {
    let pista = pistas.findIndex((p) =>
      p.every((otro) => otro.end < tramo.start || otro.start > tramo.end),
    );
    if (pista === -1) {
      pista = pistas.length;
      pistas.push([]);
    }
    pistas[pista].push(tramo);
    mapa.set(tramo.id, pista);
  }
  return mapa;
};
