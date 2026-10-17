// Quién ganó un proceso y por cuánto, a partir de su adjudicación (la API
// de licitaciones la trae por ítem: RUT, nombre, cantidad y monto
// unitario). Lo usan "el año anterior", "Se viene" y los competidores.

export type Ganador = {
  rut: string | null;
  nombre: string;
  monto: number | null;
};

export type Adjudicacion = {
  oferentes?: number | null;
  url_acta?: string | null;
  ganadores?: Array<{
    nombre?: string | null;
    rut?: string | null;
    cantidad?: number | null;
    monto_unitario?: number | null;
  }>;
} | null;

/** "77.067.895-1" y "77067895-1" son el mismo. */
export const normalizarRut = (rut: string | null | undefined): string =>
  (rut ?? '').replace(/[.\s]/g, '').toUpperCase();

/** Lo adjudicado a cada ganador, sumado (monto unitario por cantidad).
 *  Se agrupa por RUT; sin RUT, por nombre. Sin ningún precio, el monto
 *  queda en null (no es lo mismo que cero). */
export const ganadoresDe = (adjudicacion: Adjudicacion): Ganador[] => {
  const porGanador = new Map<string, Ganador>();
  for (const g of adjudicacion?.ganadores ?? []) {
    const nombre = (g.nombre ?? '').trim();
    const rut = normalizarRut(g.rut) || null;
    const clave = rut ?? nombre;
    if (!clave) continue;
    const linea =
      g.monto_unitario != null ? g.monto_unitario * (g.cantidad ?? 1) : null;
    const antes = porGanador.get(clave);
    porGanador.set(clave, {
      rut,
      nombre: antes?.nombre || nombre || rut || '',
      monto:
        linea == null ? (antes?.monto ?? null) : (antes?.monto ?? 0) + linea,
    });
  }
  return [...porGanador.values()];
};
