import type { CategoriaParaElegir } from "../../services/oportunidades-config.service";

// LAS CATEGORÍAS DE CHILECOMPRA EN CONFIGURACIÓN (decisión 111): cómo se
// muestra cada una en la lista para elegir el rubro.

/** «RESTAURANTES Y CATERING» → «Restaurantes y catering». */
export const aOracion = (texto: string): string =>
  texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();

/** «Restaurantes y catering · 516 licitaciones · sugerida»: el número es lo
 *  que tuvo en las regiones de la empresa en 3 años. */
export const etiquetaDeCategoria = (c: CategoriaParaElegir): string =>
  [
    aOracion(c.categoria),
    `${c.licitaciones.toLocaleString("es-CL")} ${c.licitaciones === 1 ? "licitación" : "licitaciones"}`,
    ...(c.sugerida ? ["sugerida"] : []),
  ].join(" · ");

/** Las opciones de la lista, en el orden que trae el motor. Una elegida
 *  que no venga en la lista también sale, para poder quitarla. */
export const opcionesDeCategoria = (
  lista: readonly CategoriaParaElegir[],
  elegidas: readonly string[],
): { value: string; label: string }[] => [
  ...lista.map((c) => ({ value: c.categoria, label: etiquetaDeCategoria(c) })),
  ...elegidas
    .filter((e) => !lista.some((c) => c.categoria === e))
    .map((e) => ({ value: e, label: aOracion(e) })),
];
