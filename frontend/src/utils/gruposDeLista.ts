/**
 * UNA LISTA POR GRUPOS (12-10-2026, migraciones 120 y 121). Felipe: "un
 * cliente me pregunta por un paseo y debo tener dos o tres alternativas
 * juntas" y "así podemos ordenar también los menús guardados de cada
 * categoría". La misma regla para "Partir de un paquete" y "Usar menú
 * guardado":
 *
 * Los grupos van en el orden que decide la empresa (sort_order; a igual
 * orden, por nombre) y, dentro de cada grupo, en el orden que se pase (hoy:
 * de menor a mayor precio por persona). Al final, bajo "Otros", los que no
 * tienen grupo o tienen uno que ya no existe.
 */
export interface GrupoDeLista {
  id: number;
  name: string;
  sort_order: number;
}

export interface EnSuGrupo<T> {
  elemento: T;
  grupo: GrupoDeLista | null;
}

export const ordenarPorGrupo = <T>(
  elementos: T[],
  grupos: GrupoDeLista[],
  grupoIdDe: (x: T) => number | null | undefined,
  dentro: (a: T, b: T) => number,
): EnSuGrupo<T>[] => {
  const orden = [...grupos].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
  const posicionDe = new Map(orden.map((g, i) => [g.id, i]));
  const posicion = (x: T) => {
    const id = grupoIdDe(x);
    return id != null ? (posicionDe.get(id) ?? orden.length) : orden.length;
  };
  return [...elementos]
    .sort((a, b) => posicion(a) - posicion(b) || dentro(a, b))
    .map((elemento) => ({
      elemento,
      grupo: orden[posicion(elemento)] ?? null,
    }));
};

/** Bajo el título, la fila no repite el grupo: "Full day: estándar" bajo
 *  "Full day" se lee "Estándar". Si el nombre no empieza con su grupo,
 *  queda igual. */
export const nombreBajoElGrupo = (nombre: string, grupo: string): string => {
  const i = nombre.indexOf(":");
  if (i <= 0) return nombre;
  const prefijo = nombre.slice(0, i).trim();
  if (prefijo.localeCompare(grupo.trim(), "es", { sensitivity: "base" }) !== 0)
    return nombre;
  const resto = nombre.slice(i + 1).trim();
  return resto
    ? resto.charAt(0).toLocaleUpperCase("es") + resto.slice(1)
    : nombre;
};
