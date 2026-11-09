// UN COLOR POR EVENTO EN LA SÁBANA (Felipe, 09-11-2026: "todavía siento que
// hay muchos grises… dime cómo le vamos a meter más color"; maquetas
// aprobadas: "si hazlo así" y "ok dale así").
//
// Cada evento lleva su color en la banda —una línea a la izquierda que baja
// por todas sus filas, el fondo suave de su título, una barra sobre sus días
// y su botoncito «+ cargo»— y en el «+» de los días de antes y después. Los
// colores evitan los que ya significan algo en la sábana: verde (completo),
// ámbar (falta gente), azul (planta) y lila (staff). Se reparten EN ORDEN,
// por la posición del evento en la cascada: dos eventos seguidos nunca
// llevan el mismo. (La primera versión los sacaba del número de la
// cotización y, visto en el laboratorio, la #384 y la #456 salían iguales,
// igual que la #460 y la #454.)
//
// Las clases van escritas enteras (nada de `bg-${color}-400`): Tailwind solo
// genera las que encuentra tal cual en el código.

export interface ColorDeEvento {
  /** La barra sobre los días del evento y la línea de la izquierda. */
  readonly barra: string;
  /** El número y el detalle del evento. */
  readonly texto: string;
  /** El fondo suave de la fila del título. */
  readonly fondo: string;
  /** El «+» de los días de antes y después: callado, y con su cajita al
   *  pasar el mouse. */
  readonly mas: string;
  /** El botoncito «+ cargo» del evento. */
  readonly boton: string;
}

export const COLORES_DE_EVENTO: readonly ColorDeEvento[] = [
  {
    barra: "bg-teal-400",
    texto: "text-teal-800",
    fondo: "bg-teal-50",
    mas: "text-teal-400 border-transparent hover:text-teal-700 hover:bg-teal-50 hover:border-teal-300",
    boton: "border-teal-300 bg-white/70 hover:bg-white",
  },
  {
    barra: "bg-rose-400",
    texto: "text-rose-800",
    fondo: "bg-rose-50",
    mas: "text-rose-400 border-transparent hover:text-rose-700 hover:bg-rose-50 hover:border-rose-300",
    boton: "border-rose-300 bg-white/70 hover:bg-white",
  },
  {
    barra: "bg-orange-400",
    texto: "text-orange-800",
    fondo: "bg-orange-50",
    mas: "text-orange-400 border-transparent hover:text-orange-700 hover:bg-orange-50 hover:border-orange-300",
    boton: "border-orange-300 bg-white/70 hover:bg-white",
  },
  {
    barra: "bg-cyan-400",
    texto: "text-cyan-800",
    fondo: "bg-cyan-50",
    mas: "text-cyan-400 border-transparent hover:text-cyan-700 hover:bg-cyan-50 hover:border-cyan-300",
    boton: "border-cyan-300 bg-white/70 hover:bg-white",
  },
  {
    barra: "bg-lime-500",
    texto: "text-lime-800",
    fondo: "bg-lime-50",
    mas: "text-lime-500 border-transparent hover:text-lime-700 hover:bg-lime-50 hover:border-lime-300",
    boton: "border-lime-300 bg-white/70 hover:bg-white",
  },
  {
    barra: "bg-fuchsia-400",
    texto: "text-fuchsia-800",
    fondo: "bg-fuchsia-50",
    mas: "text-fuchsia-400 border-transparent hover:text-fuchsia-700 hover:bg-fuchsia-50 hover:border-fuchsia-300",
    boton: "border-fuchsia-300 bg-white/70 hover:bg-white",
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
