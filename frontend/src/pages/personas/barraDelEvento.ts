import type { FilaSemana } from "./bandasDelStaff";
import type { ColorDeEvento } from "./coloresDeEvento";

/** El número y el resto del rótulo de un evento: "#522 · FDN Canotaje ·
 *  mié 4 nov al dom 8 nov" → "#522" y "FDN Canotaje · mié 4 nov al…". */
const partesDelEvento = (f: Pick<FilaSemana, "evento">) => {
  const [numero = "", ...resto] = f.evento.split(" · ");
  return { numero, detalle: resto.join(" · ") };
};

/** La banda de un evento con su color y la barra de sus días; sin fechas
 *  (un evento que no está en la lista), la banda gris de siempre. */
export const barraDelEvento = (
  f: Pick<FilaSemana, "quotationId" | "diasDelEvento" | "evento">,
  color: ColorDeEvento,
  conEnlace: boolean,
) => {
  if (f.quotationId === null || f.diasDelEvento.size === 0) return undefined;
  const { numero, detalle } = partesDelEvento(f);
  return {
    numero,
    detalle,
    dias: f.diasDelEvento,
    color,
    // El número lleva a la ficha del evento en Post-Venta (19-11-2026);
    // solo para quien puede verla, igual que el Calendario.
    enlace: conEnlace ? `/post-venta/${f.quotationId}` : undefined,
  };
};
