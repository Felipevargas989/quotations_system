// Memoria de filtros del tablero de cotizaciones (05-08-2026, pedido
// de Felipe): entrar a una ficha y volver no borra la búsqueda,
// "Requieren" ni el acordeón de rechazadas. sessionStorage a
// propósito: al cerrar la pestaña el tablero parte limpio (un filtro
// viejo escondido miente más de lo que ayuda). Clave por usuario,
// igual que el orden: lo que buscó una cuenta no puede aparecerle a
// otra en la misma pestaña.
const FILTROS_TABLERO_KEY = (userId: string | number) =>
  `eventia_quotations_filtros_tablero_${userId}`;

export type FiltrosTablero = {
  busqueda?: string;
  soloSeguimiento?: boolean;
  verRechazadas?: boolean;
};

export const filtrosGuardados = (
  userId: string | number | undefined,
): FiltrosTablero => {
  if (userId === undefined) return {};
  try {
    // JSON.parse puede devolver null o tipos raros sin lanzar error:
    // solo se confía en lo que tiene la forma exacta esperada.
    const v: unknown = JSON.parse(
      sessionStorage.getItem(FILTROS_TABLERO_KEY(userId)) ?? "{}",
    );
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const f = v as Record<string, unknown>;
    return {
      busqueda: typeof f.busqueda === "string" ? f.busqueda : undefined,
      soloSeguimiento:
        typeof f.soloSeguimiento === "boolean" ? f.soloSeguimiento : undefined,
      verRechazadas:
        typeof f.verRechazadas === "boolean" ? f.verRechazadas : undefined,
    };
  } catch {
    return {};
  }
};

export const guardarFiltros = (
  userId: string | number | undefined,
  filtros: FiltrosTablero,
): void => {
  if (userId === undefined) return;
  try {
    sessionStorage.setItem(FILTROS_TABLERO_KEY(userId), JSON.stringify(filtros));
  } catch {
    // sin sessionStorage disponible: los filtros viven sin memoria
  }
};

// Al CREAR una cotización el tablero olvida sus filtros: la tarjeta
// nueva debe aparecer sí o sí al volver — una búsqueda vieja que la
// esconde se lee como "la creación falló".
export const olvidarFiltrosTablero = (
  userId: string | number | undefined,
): void => {
  if (userId === undefined) return;
  try {
    sessionStorage.removeItem(FILTROS_TABLERO_KEY(userId));
  } catch {
    // nada que olvidar si no hay storage
  }
};
