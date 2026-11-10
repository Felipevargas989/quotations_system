// LOS COLORES DE LAS SECCIONES (09-11-2026): la sábana de Planificación
// separa Eventos, Personal de planta y Personal Staff con el color de sus
// celdas —verde, azul y lila—, y el resumen del día usa los mismos para
// sus tres bloques.
//
// El título de cada sección es una PESTAÑA de color fuerte con letra blanca
// y una línea fina del mismo color (Felipe, 09-11-2026: "los títulos de las
// secciones se confunden con los colores de cada evento… ¿alguna otra forma
// de separarlos sin perder visualmente las secciones?"; de dos maquetas
// eligió la 2). Antes era una franja pastel con una línea a la izquierda,
// igual a la de cada evento. La pieza es TituloDeSeccion.

export type ColorDeSeccion = "verde" | "azul" | "violeta";

/** El fondo de la pestaña del título. */
export const PESTANA_DE_SECCION: Record<ColorDeSeccion, string> = {
  verde: "bg-emerald-600",
  azul: "bg-blue-600",
  violeta: "bg-violet-600",
};

/** La línea fina que sigue a la pestaña. */
export const LINEA_DE_SECCION: Record<ColorDeSeccion, string> = {
  verde: "border-emerald-600",
  azul: "border-blue-600",
  violeta: "border-violet-600",
};

/** El texto de lo que acompaña al título a la derecha (un subtotal). */
export const TEXTO_DE_SECCION: Record<ColorDeSeccion, string> = {
  verde: "text-emerald-800",
  azul: "text-blue-800",
  violeta: "text-violet-800",
};
