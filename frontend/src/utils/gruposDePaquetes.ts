import type {
  GrupoDePaquetes,
  ServiceGroupCollection,
} from "../types/serviceGroupCollections.types";

/**
 * LOS PAQUETES EN SU LISTA (12-10-2026, migración 120). Felipe: "un cliente
 * me pregunta por un paseo y debo tener dos o tres alternativas juntas y
 * si no tengo que estar scrolleando mucho".
 *
 * Los grupos van en el orden que decide la empresa (sort_order; a igual
 * orden, por nombre) y, dentro de cada grupo, en el orden que se pase (hoy:
 * de menor a mayor precio por persona). Al final, bajo "Otros", los que no
 * tienen grupo o tienen uno que ya no existe.
 */
export interface PaqueteEnLista<T> {
  paquete: T;
  grupo: GrupoDePaquetes | null;
}

export const ordenarPorGrupo = <
  T extends Pick<ServiceGroupCollection, "name" | "package_group_id">,
>(
  paquetes: T[],
  grupos: GrupoDePaquetes[],
  dentro: (a: T, b: T) => number,
): PaqueteEnLista<T>[] => {
  const orden = [...grupos].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
  const posicionDe = new Map(orden.map((g, i) => [g.id, i]));
  const grupoDe = (p: T) =>
    p.package_group_id != null
      ? (orden[posicionDe.get(p.package_group_id) ?? -1] ?? null)
      : null;
  const posicion = (p: T) =>
    p.package_group_id != null
      ? (posicionDe.get(p.package_group_id) ?? orden.length)
      : orden.length;
  return [...paquetes]
    .sort((a, b) => posicion(a) - posicion(b) || dentro(a, b))
    .map((paquete) => ({ paquete, grupo: grupoDe(paquete) }));
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
