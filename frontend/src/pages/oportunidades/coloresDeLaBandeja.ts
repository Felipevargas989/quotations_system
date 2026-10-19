import type { Semaforo } from "../../services/oportunidades.service";

// LA BANDEJA, UN COLOR POR SIGNIFICADO (19-10, decisión 31 del doc 17).
// Felipe: "el amarillo de los prioritarios se mezcla con el amarillo del
// semáforo y hace confuso saber cuál es más importante". Vio dos bocetos y
// eligió la B ("me gusta tu propuesta, vamos con la B"):
//  - verde, amarillo y rojo son SOLO el semáforo: la franja de la izquierda
//    y una tinta pálida en toda la fila;
//  - violeta es SOLO la prioridad: su recuadro, la estrella y sus razones
//    («Comuna cercana», «Alto valor»);
//  - la urgencia va con un reloj, sin rojo: el rojo es de las rojas.
// Las clases van escritas enteras para que Tailwind las encuentre.

export const FILA_DEL_SEMAFORO: Record<Semaforo, string> = {
  verde: "border-l-green-500 bg-green-50/70 hover:bg-green-100/70",
  amarillo: "border-l-amber-400 bg-amber-50/70 hover:bg-amber-100/70",
  rojo: "border-l-red-400 bg-red-50/60 hover:bg-red-100/60",
};

export const FILA_SIN_LEER = "border-l-gray-300 bg-white hover:bg-gray-50";

/** El color de UNA fila, para quien lee con lector de pantalla (la franja
 *  no se ve con los oídos). */
export const NOMBRE_DEL_SEMAFORO: Record<Semaforo, string> = {
  verde: "Verde",
  amarillo: "Amarilla",
  rojo: "Roja",
};

export const filaDelSemaforo = (semaforo?: Semaforo | null): string =>
  semaforo ? FILA_DEL_SEMAFORO[semaforo] : FILA_SIN_LEER;

/** Las razones de la prioridad: las alertas de comuna cercana y alto valor. */
export const RAZON_DE_PRIORIDAD = "bg-violet-50 text-violet-700";

/** El recuadro de cada grupo de la lista y su título. */
export const RECUADRO_DEL_GRUPO = {
  prioridad: {
    recuadro: "border-violet-200",
    titulo: "bg-violet-50/70 border-violet-100 text-violet-700",
  },
  otro: {
    recuadro: "border-gray-200",
    titulo: "bg-gray-50 border-gray-200 text-gray-600",
  },
} as const;
