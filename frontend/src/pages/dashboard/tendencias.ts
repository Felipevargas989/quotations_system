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

/** Etiqueta legible de una clave de mes ("2025-08" → "Ago 25"). */
export const etiquetaMes = (clave: string) => {
  const [a, m] = clave.split("-");
  return `${MESES[Number(m) - 1] || m} ${a.slice(2)}`;
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

// ---- LA COSECHA DEL MES (06/07-08-2026, hallazgo y diseño de Felipe) ----
// "El año pasado en agosto saqué 47 cotizaciones... ¿y a quién?". El
// calendario dice cuándo fue el EVENTO; nadie decía cuándo te PIDIERON
// cotizar — y esa lista, un año después, es la lista de llamados del mes.
//
// LA REGLA ES SIMPLE A PROPÓSITO. El 07-08 se probó adivinar el regreso
// con distancias entre fechas y se rompió sola dos veces:
//   · FEPASA parte UN evento en dos cotizaciones (adultos y niños): la
//     regla las leía como una re-cotización de la misma venta.
//   · La Iglesia Adventista re-cotizó al día siguiente: la regla lo leía
//     como un regreso, y apagaba la alarma en un cliente que no volvió.
// Conclusión de Felipe, y es la correcta: ninguna regla le gana al ojo de
// quien vende. Así que la máquina SUGIERE con el cruce de siempre
// —empresa + mandante + tipo de evento— y él tiene la palabra final.

export type EstadoCosecha =
  | "revendido"
  | "en_gestion"
  | "no_ha_vuelto"
  | "no_se_repite"
  | "descartado";

/** Los cinco estados, en el orden en que se leen en el desplegable.
 *
 *  OJO: esta lista tiene una gemela en el backend
 *  (api-rest/src/quotations/dto/estado-cosecha.dto.ts → ESTADOS_COSECHA)
 *  y no hay nada que las obligue a coincidir: el repo no tiene paquete
 *  compartido, las dos apps solo hablan por HTTP. Agregar un estado acá
 *  sin agregarlo allá se ve como un chip que vuelve solo, sin
 *  explicación. Se tocan las dos o ninguna. */
export const ESTADOS_COSECHA: {
  v: EstadoCosecha;
  l: string;
  chip: string;
  ayuda: string;
}[] = [
  {
    v: "revendido",
    l: "✓ Revendido",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
    ayuda: "Volvió a pedir lo mismo",
  },
  {
    v: "en_gestion",
    l: "☎ En gestión",
    chip: "bg-blue-50 text-blue-800 border-blue-200",
    ayuda: "Ya lo llamé, lo estoy trabajando",
  },
  {
    v: "no_ha_vuelto",
    l: "⚠ No ha vuelto",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    ayuda: "Pendiente de llamado",
  },
  {
    v: "no_se_repite",
    l: "⊘ No se repite",
    chip: "bg-violet-50 text-violet-800 border-violet-200",
    ayuda: "Evento único: no es un cliente perdido, simplemente no vuelve",
  },
  {
    v: "descartado",
    l: "✕ Descartado",
    chip: "bg-gray-100 text-gray-600 border-gray-200",
    ayuda: "No insistir",
  },
];

export const metaEstado = (v: EstadoCosecha) =>
  ESTADOS_COSECHA.find((e) => e.v === v) ?? ESTADOS_COSECHA[2];

export type FilaCosecha = {
  id: string;
  numero: number;
  cliente: string;
  tipoCliente: string;
  mandante: string;
  tipo: string;
  monto: number;
  estado: string;
  /** El cruce empresa|mandante|tipo: la unidad real de "un llamado". */
  llave: string;
  /** Lo que sugiere la máquina; solo puede proponer 3 de los 5. */
  sugerido: EstadoCosecha;
  /** La cotización posterior que gatilló la sugerencia, si la hubo. */
  posteriorEl: string | null;
  posteriorNumero: number | null;
  posteriorId: string | null;
  /** La palabra de Felipe (migración 63). null = manda la sugerencia.
   *  Es de ESTA fila y de ninguna otra: se probó arrastrar a las
   *  hermanas del mismo cruce y Felipe lo cortó al toque (07-08, movió
   *  la #97 y se le movió la #107). Cada fila manda sobre sí misma. */
  estadoManual: EstadoCosecha | null;
  /** Lo que se muestra: su corrección si existe, si no la sugerencia. */
  efectivo: EstadoCosecha;
  /** Cuándo y quién tocó esta fila por última vez (migración 62). */
  anotadoEl: string | null;
  anotadoPor: string | null;
};

const canonizar = (t?: string | null) =>
  (t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

type QCosecha = {
  id?: string;
  quotation_number?: number;
  created_at?: string | Date | null;
  event_type?: string | null;
  total_amount?: number | null;
  quotation_status?: string | null;
  contact_name?: string | null;
  harvest_status?: string | null;
  recontacted_at?: string | null;
  recontacted_by?: string | null;
  clients?: { name?: string | null; client_type?: string | null } | null;
};

// El mes de una fecha, venga como texto ISO o como Date. El tipo de la
// lista declara `created_at: Date` aunque la API entregue texto: cortar
// a ciegas con slice(0,7) sobre un Date daría "Fri Aug" y la cosecha
// saldría vacía sin avisar (revisión del 07-08).
const mesDe = (v?: string | Date | null): string => {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 7);
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 7) : "";
};

// Instante comparable, con el mismo cuidado.
const instante = (v?: string | Date | null): number => {
  if (!v) return 0;
  const t = new Date(v as string | Date).getTime();
  return Number.isFinite(t) ? t : 0;
};

const esEstado = (v?: string | null): EstadoCosecha | null =>
  ESTADOS_COSECHA.some((e) => e.v === v) ? (v as EstadoCosecha) : null;

// Un matrimonio no se repite: el mismo novio con el mismo mandante no
// vuelve el año siguiente. Se sugiere solo para ese tipo — "Graduación"
// NO, porque un colegio gradúa un curso cada año (07-08, medido: la
// lista de tipos es cerrada, 8 valores, sin texto libre).
const NO_SE_REPITE = new Set(["matrimonio", "matrimonios"]);

export const cosechaDelMes = (
  filas: QCosecha[],
  claveMes: string,
): FilaCosecha[] => {
  // La llave de la oportunidad. Si falta el cliente o el mandante no hay
  // nada que agrupar: la fila va sola con su propio id, para no arrastrar
  // cotizaciones ajenas que solo comparten el tipo de evento (revisión
  // del 07-08; hoy no hay ninguna así, pero el portal público podría
  // crearla y el daño sería silencioso).
  const llaveDe = (q: QCosecha) => {
    const cli = canonizar(q.clients?.name);
    const man = canonizar(q.contact_name);
    if (!cli || !man) return `#${String(q.id || "")}`;
    return `${cli}|${man}|${canonizar(q.event_type)}`;
  };

  // La pregunta, una sola: ¿este cruce pidió algo DESPUÉS de este mes?
  // Se compara contra el MES, no contra cada cotización: así las dos
  // cotizaciones de un mismo evento (FEPASA: adultos y niños) reciben la
  // misma respuesta, que es lo correcto — son un solo llamado.
  const posterior = new Map<string, QCosecha>();
  filas.forEach((q) => {
    if (mesDe(q.created_at) <= claveMes) return;
    const k = llaveDe(q);
    const previa = posterior.get(k);
    if (!previa || instante(q.created_at) > instante(previa.created_at))
      posterior.set(k, q);
  });

  return filas
    .filter((q) => mesDe(q.created_at) === claveMes)
    .map((q) => {
      const llave = llaveDe(q);
      const luego = posterior.get(llave);
      let sugerido: EstadoCosecha;
      if (luego) sugerido = "revendido";
      else if (NO_SE_REPITE.has(canonizar(q.event_type)))
        sugerido = "no_se_repite";
      else sugerido = "no_ha_vuelto";
      const estadoManual = esEstado(q.harvest_status);
      return {
        id: String(q.id || ""),
        numero: q.quotation_number || 0,
        cliente: q.clients?.name || "—",
        tipoCliente: (q.clients?.client_type || "").trim(),
        mandante: (q.contact_name || "").trim(),
        tipo: q.event_type || "—",
        monto: q.total_amount || 0,
        estado: String(q.quotation_status || ""),
        llave,
        sugerido,
        posteriorEl: luego ? String(luego.created_at || "") : null,
        posteriorNumero: luego ? luego.quotation_number || 0 : null,
        posteriorId: luego ? String(luego.id || "") : null,
        estadoManual,
        efectivo: estadoManual ?? sugerido,
        anotadoEl: q.recontacted_at || null,
        anotadoPor: q.recontacted_by || null,
      };
    })
    .sort((a, b) => b.monto - a.monto);
};

/** Cómo terminó cada cotización, en cristiano. Importa en la cosecha:
 * llamar a quien ya te compró y realizó el evento no es lo mismo que
 * insistirle a quien te rechazó (pregunta de Felipe, 06-08). */
export const ETIQUETA_ESTADO: Record<string, { l: string; c: string }> = {
  solicitada: { l: "Solicitada", c: "bg-gray-100 text-gray-700" },
  enviada: { l: "Enviada", c: "bg-blue-50 text-blue-700" },
  en_negociacion: { l: "En negociación", c: "bg-indigo-50 text-indigo-700" },
  aceptada: { l: "Aceptada", c: "bg-emerald-50 text-emerald-700" },
  realizada: { l: "Realizada", c: "bg-emerald-100 text-emerald-800" },
  rechazada: { l: "Rechazada", c: "bg-red-50 text-red-700" },
  cancelada: { l: "Anulada", c: "bg-orange-50 text-orange-700" },
};
