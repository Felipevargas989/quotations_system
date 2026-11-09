// LOS COLORES DE LAS SECCIONES (09-11-2026): la sábana de Planificación
// separa Eventos, Personal de planta y Personal Staff con el color de sus
// celdas —verde, azul y lila—, y el resumen del día usa los mismos para
// sus tres bloques. Viven aparte de GrillaDeDias para que ese archivo
// exporte solo componentes (regla react-refresh del lint).

export type ColorDeSeccion = "verde" | "azul" | "violeta";

/** La línea de la izquierda, el fondo suave y el texto de cada sección. */
export const COLOR_SECCION: Record<ColorDeSeccion, string> = {
  verde: "border-emerald-500 bg-emerald-50/70 text-emerald-900",
  azul: "border-blue-500 bg-blue-50/70 text-blue-900",
  violeta: "border-violet-500 bg-violet-50/70 text-violet-900",
};
