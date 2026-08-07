// TENDENCIA INTERANUAL (06-08-2026, diseño de Felipe). Los gráficos de
// tendencia dejan de obedecer al filtro del período: su trabajo no es
// analizar un rango sino mostrar el pulso del negocio contra el año
// anterior. Línea firme = hoy; línea tenue = el mismo mes del año pasado.
//
// La gracia está en el gráfico de EVENTOS: además de los 12 meses
// corridos proyecta 4 meses hacia adelante con lo que YA está agendado,
// y en esos meses futuros la serie tenue trae lo que REALMENTE pasó el
// año anterior. A mitad de agosto se ve "para noviembre llevo 3 y el
// noviembre pasado terminé con 7" — una alarma con tiempo de reacción.

export type FilaMes = { clave: string; etiqueta: string };

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const claveDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Ventana de meses: `atras` hacia atrás (incluye el actual) y `adelante`. */
export const ventanaMeses = (atras: number, adelante = 0): FilaMes[] => {
  const hoy = new Date();
  const filas: FilaMes[] = [];
  for (let i = atras - 1; i >= -adelante; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    filas.push({
      clave: claveDe(d),
      etiqueta: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    });
  }
  return filas;
};

/** La misma clave, un año antes ("2026-08" → "2025-08"). */
export const unAnioAntes = (clave: string) => {
  const [a, m] = clave.split("-");
  return `${Number(a) - 1}-${m}`;
};

// Lo mínimo que la serie necesita leer. Deliberadamente laxo: recibe
// cualquier cotización del sistema sin acoplarse a su tipo completo.
export type CotizacionMinima = {
  created_at?: string | Date | null;
  event_date?: string | Date | null;
  total_amount?: number | null;
  quotation_status?: string | null;
};

/** Suma por mes: {clave: {n, monto}}. `campo` decide qué fecha manda. */
export const agruparPorMes = (
  filas: CotizacionMinima[],
  campo: "created_at" | "event_date",
): Map<string, { n: number; monto: number }> => {
  const mapa = new Map<string, { n: number; monto: number }>();
  filas.forEach((q) => {
    const iso = q[campo];
    if (!iso) return;
    const clave = String(iso).slice(0, 7);
    // Fechas basura de migraciones antiguas (1970) no ensucian la serie.
    if (clave < "2000-01") return;
    const a = mapa.get(clave) || { n: 0, monto: 0 };
    mapa.set(clave, { n: a.n + 1, monto: a.monto + (q.total_amount || 0) });
  });
  return mapa;
};

/** Confirmado = lo que de verdad es un evento (decisión de Felipe). */
export const ES_EVENTO = new Set(["aceptada", "realizada"]);

/** Serie lista para el gráfico: valores de este año y del anterior.
 *
 * Los meses SIN historia van como null, no como 0 (corregido el 06-08
 * tras verlo en pantalla): un cero dice "no vendimos nada" y es mentira
 * cuando en realidad el sistema todavía no existía —los datos parten en
 * agosto de 2025—. Un hueco no miente. `desde` marca el primer mes con
 * datos reales: antes de eso, ni una línea. */
export const serieInteranual = (
  meses: FilaMes[],
  mapa: Map<string, { n: number; monto: number }>,
  medida: "n" | "monto",
  desde?: string,
) => {
  const valor = (clave: string): number | null => {
    if (desde && clave < desde) return null;
    const v = mapa.get(clave);
    // Mes dentro del rango con historia pero sin movimiento: eso sí es 0.
    if (!v) return desde ? 0 : null;
    return v[medida];
  };
  return {
    etiquetas: meses.map((m) => m.etiqueta),
    actual: meses.map((m) => valor(m.clave)),
    anterior: meses.map((m) => valor(unAnioAntes(m.clave))),
  };
};

/** El mes más antiguo con datos: antes de eso el sistema no existía. */
export const primerMesConDatos = (
  mapas: Map<string, { n: number; monto: number }>[],
): string | undefined => {
  const claves = mapas.flatMap((m) => [...m.keys()]).filter((k) => k >= "2000-01");
  return claves.length ? claves.sort()[0] : undefined;
};

/** Índice del mes en curso (el último que va a medias). */
export const indiceMesActual = (meses: FilaMes[]): number => {
  const hoy = new Date();
  const clave = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  return meses.findIndex((m) => m.clave === clave);
};
