// EL VÍNCULO CAJA ↔ CATEGORÍA (06-08-2026, diseño de Felipe: "no es al
// nombre donde debe apuntar sino al código de la categoría, así no
// importa cómo la llame").
//
// Hasta hoy la foto de la cotización guardaba SOLO el nombre de la
// categoría, y todo el sistema la reencontraba comparando ese texto.
// Al renombrar una categoría en el catálogo, las cotizaciones ya
// guardadas quedaban huérfanas: sin secciones en el documento y — peor
// — con el buscador de ítems vacío al editarlas.
//
// Desde ahora la foto lleva TAMBIÉN el id, que no cambia jamás. Al
// resolver se prueba en orden: id → nombre exacto → nombre normalizado
// (para las fotos viejas que solo tienen texto, donde la única
// diferencia suele ser el plural: "Desayunos" vs "Desayuno").

export type CategoriaCatalogo = { id: number; name: string };
export type CajaConCategoria = {
  category?: string | null;
  category_id?: number | null;
};

// Sin tildes, sin mayúsculas y sin la "s" del plural.
const canon = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/s$/, "");

export const buscarCategoria = <T extends CategoriaCatalogo>(
  categorias: T[],
  caja: CajaConCategoria,
): T | undefined => {
  if (caja.category_id != null) {
    const porId = categorias.find((c) => c.id === caja.category_id);
    if (porId) return porId;
  }
  const nombre = (caja.category || "").trim();
  if (!nombre) return undefined;
  return (
    categorias.find((c) => c.name === nombre) ??
    categorias.find((c) => canon(c.name) === canon(nombre))
  );
};

// El nombre VIGENTE en el catálogo (para los buscadores y listados que
// siguen trabajando por nombre); si la categoría ya no existe, se
// respeta el nombre guardado —la foto no se reescribe sola—.
export const nombreVigente = (
  categorias: CategoriaCatalogo[],
  caja: CajaConCategoria,
): string => buscarCategoria(categorias, caja)?.name ?? (caja.category || "");
