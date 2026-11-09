// UN COLOR POR EVENTO EN LA SÁBANA (Felipe, 09-11-2026: "todavía siento que
// hay muchos grises… dime cómo le vamos a meter más color"; maqueta
// aprobada: "si hazlo así").
//
// Cada evento lleva su color en la banda —una línea a la izquierda, su
// número y una barra sobre sus días, para ver la cascada de un vistazo— y en
// el «+» de los días de antes y después. Los colores evitan los que ya
// significan algo en la sábana: verde (completo), ámbar (falta gente), azul
// (planta) y lila (staff). Los colores se reparten EN ORDEN, por la posición
// del evento en la cascada: dos eventos seguidos nunca llevan el mismo. (La
// primera versión los sacaba del número de la cotización y, visto en el
// laboratorio, la #384 y la #456 salían iguales, igual que la #460 y la
// #454.)
//
// Las clases van escritas enteras (nada de `bg-${color}-400`): Tailwind solo
// genera las que encuentra tal cual en el código.

export interface ColorDeEvento {
  /** La barra sobre los días del evento. */
  readonly barra: string;
  /** La línea de la izquierda de la banda. */
  readonly borde: string;
  /** El número y el detalle del evento. */
  readonly texto: string;
  /** El «+» de los días de antes y después. */
  readonly mas: string;
}

export const COLORES_DE_EVENTO: readonly ColorDeEvento[] = [
  {
    barra: "bg-teal-400",
    borde: "border-teal-400",
    texto: "text-teal-800",
    mas: "text-teal-700 bg-teal-50 border-teal-300 hover:bg-teal-100",
  },
  {
    barra: "bg-rose-400",
    borde: "border-rose-400",
    texto: "text-rose-800",
    mas: "text-rose-700 bg-rose-50 border-rose-300 hover:bg-rose-100",
  },
  {
    barra: "bg-orange-400",
    borde: "border-orange-400",
    texto: "text-orange-800",
    mas: "text-orange-700 bg-orange-50 border-orange-300 hover:bg-orange-100",
  },
  {
    barra: "bg-cyan-400",
    borde: "border-cyan-400",
    texto: "text-cyan-800",
    mas: "text-cyan-700 bg-cyan-50 border-cyan-300 hover:bg-cyan-100",
  },
  {
    barra: "bg-lime-500",
    borde: "border-lime-500",
    texto: "text-lime-800",
    mas: "text-lime-700 bg-lime-50 border-lime-300 hover:bg-lime-100",
  },
  {
    barra: "bg-fuchsia-400",
    borde: "border-fuchsia-400",
    texto: "text-fuchsia-800",
    mas: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-300 hover:bg-fuchsia-100",
  },
];

/** El color del evento que va en esa posición de la cascada (0 = el
 *  primero). Se repite recién después de seis eventos. */
export const colorDelEvento = (
  posicion: number | null | undefined,
): ColorDeEvento => {
  const n = Number.isFinite(posicion)
    ? Math.abs(Math.trunc(Number(posicion)))
    : 0;
  return COLORES_DE_EVENTO[n % COLORES_DE_EVENTO.length];
};
