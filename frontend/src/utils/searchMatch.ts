// Búsqueda inteligente única del sistema (definida con Felipe el
// 21-07-2026, tras el caso "universidad concepción" que no encontraba
// "Universidad de Concepción"):
//
// 1. Ignora tildes, diéresis y mayúsculas ("concepcion" = "Concepción").
// 2. Busca por PALABRAS en cualquier orden: basta que todas las palabras
//    escritas aparezcan en alguna parte del texto ("tali kum" encuentra
//    "Fundación Talita Kum").
//
// TODOS los buscadores y selectores con búsqueda usan estas funciones —
// un solo criterio para siempre.

export const normalizeText = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Nombre CANÓNICO de un servicio del catálogo, para emparejar los items
 *  guardados en cotizaciones (fotos con nombres antiguos) contra el
 *  catálogo vigente: sin tildes ni mayúsculas, sin el prefijo de orden
 *  ("02 - "), espacios colapsados y "1pp" ≡ "1 pp". Definido el 22-07
 *  tras la limpieza de nombres del catálogo que dejó recetas sin
 *  reconocer en Gestión y la ficha de cocina. */
export const canonicalServiceName = (name: string): string =>
  normalizeText(name)
    .replace(/^\s*\d+\s*-\s*/, "")
    .replace(/(\d)\s*pp\b/g, "$1 pp")
    .replace(/\s+/g, " ")
    .trim();

/** true si TODAS las palabras de `query` aparecen (sin tildes ni
 *  mayúsculas, en cualquier orden) dentro de los textos entregados.
 *  Query vacía = todo coincide. */
export const matchesSearch = (
  query: string,
  ...targets: (string | null | undefined)[]
): boolean => {
  const tokens = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeText(targets.filter(Boolean).join(" "));
  return tokens.every((t) => haystack.includes(t));
};
