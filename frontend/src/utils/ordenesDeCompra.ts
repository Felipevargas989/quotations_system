// LAS FECHAS DE FACTURACIÓN (doc 19): como las lee la gente.

/** «2026-10-14» → «14-10-2026», sin pasar por Date (no se corre un día). */
export const fechaCorta = (iso: string): string => {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}-${m}-${a}` : iso;
};
