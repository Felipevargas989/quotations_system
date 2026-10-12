/**
 * EL GRUPO DE UN PAQUETE (Felipe, 12-10-2026: "un cliente me pregunta por
 * un paseo y debo tener dos o tres alternativas juntas y no estar
 * scrolleando mucho"). El grupo es lo que va antes de los dos puntos del
 * nombre: "Full day: adulto mayor" → "Full day". La convención la fijó el
 * mismo día ("Grupo: qué incluye"; docs/arquitectura/16, sección 5).
 *
 * Un nombre sin dos puntos no tiene grupo: va al final, bajo "Otros". Si
 * ninguno de los paquetes de la empresa tiene grupo, la lista se ve igual
 * que antes, sin títulos.
 */
export const grupoDePaquete = (nombre: string): string => {
  const i = nombre.indexOf(":");
  return i > 0 ? nombre.slice(0, i).trim() : "";
};

/** Lo que va después del grupo, con mayúscula inicial: bajo el título
 *  "Full day" la fila dice "Adulto mayor". Sin grupo, el nombre entero. */
export const nombreSinGrupo = (nombre: string): string => {
  if (!grupoDePaquete(nombre)) return nombre;
  const resto = nombre.slice(nombre.indexOf(":") + 1).trim();
  return resto
    ? resto.charAt(0).toLocaleUpperCase("es") + resto.slice(1)
    : nombre;
};

/** ¿Dos nombres caen bajo el mismo título? Sin distinguir mayúsculas ni
 *  tildes: "Graduación" y "graduacion" son el mismo grupo. */
export const mismoGrupo = (a: string, b: string): boolean =>
  grupoDePaquete(a).localeCompare(grupoDePaquete(b), "es", {
    sensitivity: "base",
  }) === 0;

/** Orden de la lista: por grupo (alfabético; los sin grupo al final) y,
 *  dentro de cada grupo, el orden que se pase (hoy: de menor a mayor
 *  precio por persona, `porPrecioYNombre`). */
export const porGrupoY =
  <T extends { name: string }>(dentro: (a: T, b: T) => number) =>
  (a: T, b: T): number => {
    const ga = grupoDePaquete(a.name);
    const gb = grupoDePaquete(b.name);
    if (!ga !== !gb) return ga ? -1 : 1;
    return ga.localeCompare(gb, "es", { sensitivity: "base" }) || dentro(a, b);
  };
