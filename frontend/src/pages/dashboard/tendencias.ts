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

// ---- LA COSECHA DEL MES (06-08-2026, hallazgo de Felipe) ----
// "El año pasado en agosto saqué 47 cotizaciones... ¿y a quién?". El
// calendario dice cuándo fue el EVENTO, nadie decía cuándo te PIDIERON
// cotizar — y esa lista, un año después, es la lista de llamados del mes.
//
// El cruce de "¿ya volvió?" va por CLIENTE + MANDANTE + TIPO DE EVENTO
// (afinado por Felipe): CCU puede cotizar un paseo de fin de año y una
// celebración, con mandantes distintos — son oportunidades distintas y
// dar por "vuelta" a una porque volvió la otra escondería el llamado que
// importa. Incluir el tipo es seguro: se midió y es una lista CERRADA de
// 8 opciones, sin texto libre ni variantes de nombre.

export type FilaCosecha = {
  id: string;
  numero: number;
  cliente: string;
  tipoCliente: string;
  mandante: string;
  tipo: string;
  monto: number;
  estado: string;
  // El REGRESO: una venta nueva posterior de la misma oportunidad. Con
  // su número e id para abrirla y comparar (pedido de Felipe 06-08).
  volvioEl: string | null;
  volvioNumero: number | null;
  volvioId: string | null;
  // La MISMA venta re-cotizada (no es un regreso). Ver la regla abajo.
  mismaVentaNumero: number | null;
  mismaVentaId: string | null;
  // Cuándo se intentó llamarlo (migración 62). NULL = todavía no.
  recontactadoEl: string | null;
  soloPorCliente: boolean;
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
  event_date?: string | Date | null;
  event_type?: string | null;
  total_amount?: number | null;
  quotation_status?: string | null;
  contact_name?: string | null;
  recontacted_at?: string | null;
  clients?: { name?: string | null; client_type?: string | null } | null;
};

// Cuándo dos cotizaciones son la MISMA venta y cuándo son dos ventas
// distintas. Lo trajo Felipe el 06-08 mirando la tabla: la #97 aparecía
// "vuelta" en la #107 — y eran del mismo cliente, el mismo mes y el
// evento con UN día de diferencia. No era un regreso: la rechazó y se la
// re-cotizó al día siguiente.
//
// Se midió el historial completo antes de fijar el corte:
//   · 48 de 78 pares de la misma oportunidad son del MISMO MES.
//   · CERO pares a 9-14 meses: o sea, ni uno solo de los "volvió" que
//     mostraba la tabla era un regreso anual. La columna apagaba la
//     alarma justo en quien había que llamar.
//   · Los regresos reales (Linde, CCU, Maritano, Soprole, Ferrocarril)
//     se piden con 5 a 8 meses de diferencia y su evento cae a UN AÑO
//     exacto del anterior.
//   · Al revés: Sindicato Masisa re-cotizó 4 meses después, pero para el
//     MISMO día de evento. Misma venta.
//
// De ahí la regla: hace falta distancia en LAS DOS COSAS a la vez —el
// pedido y el evento— para hablar de una venta nueva. Solo por año
// fallaría en diciembre→enero (1 mes contaría como regreso) y en
// enero→diciembre del mismo año (un regreso real no contaría).
const DIAS_VENTA_NUEVA = 60;

const dia = (v?: string | Date | null) => {
  if (!v) return null;
  const t = new Date(v as string | Date).getTime();
  return Number.isFinite(t) ? t / 86_400_000 : null;
};

/** ¿La cotización `b` abre una venta NUEVA frente a `a`, o es la misma
 *  re-cotizada? Sin fecha de evento manda solo la fecha del pedido. */
const esVentaNueva = (a: QCosecha, b: QCosecha) => {
  const p1 = dia(a.created_at), p2 = dia(b.created_at);
  if (p1 === null || p2 === null) return true;
  if (Math.abs(p2 - p1) < DIAS_VENTA_NUEVA) return false;
  const e1 = dia(a.event_date), e2 = dia(b.event_date);
  if (e1 === null || e2 === null) return true;
  return Math.abs(e2 - e1) >= DIAS_VENTA_NUEVA;
};

export const cosechaDelMes = (
  filas: QCosecha[],
  claveMes: string,
): FilaCosecha[] => {
  const llaveDe = (q: QCosecha) =>
    `${canonizar(q.clients?.name)}|${canonizar(q.contact_name)}|${canonizar(q.event_type)}`;

  // Cada oportunidad se ordena en el tiempo y se parte en VENTAS: un
  // corte cada vez que la siguiente cotización ya no es la misma venta.
  const porLlave = new Map<string, QCosecha[]>();
  filas.forEach((q) => {
    const k = llaveDe(q);
    const lista = porLlave.get(k);
    if (lista) lista.push(q);
    else porLlave.set(k, [q]);
  });

  // Para cada cotización: qué le sigue dentro de su misma venta, y cuál
  // es la primera cotización de la venta siguiente (el regreso).
  const sigue = new Map<string, QCosecha>();
  const regreso = new Map<string, QCosecha>();
  porLlave.forEach((lista) => {
    lista.sort((a, b) => (dia(a.created_at) ?? 0) - (dia(b.created_at) ?? 0));
    // Cortes: índices donde empieza una venta nueva.
    const ventas: QCosecha[][] = [];
    lista.forEach((q, i) => {
      if (i === 0 || esVentaNueva(lista[i - 1], q)) ventas.push([q]);
      else ventas[ventas.length - 1].push(q);
    });
    ventas.forEach((venta, iv) => {
      const proxima = ventas[iv + 1]?.[0];
      venta.forEach((q, i) => {
        const id = String(q.id || "");
        if (venta[i + 1]) sigue.set(id, venta[i + 1]);
        else if (proxima) regreso.set(id, proxima);
      });
    });
  });

  return filas
    .filter((q) => String(q.created_at || "").slice(0, 7) === claveMes)
    .map((q) => {
      const id = String(q.id || "");
      const otra = sigue.get(id);
      const nueva = regreso.get(id);
      return {
        id,
        numero: q.quotation_number || 0,
        cliente: q.clients?.name || "—",
        tipoCliente: (q.clients?.client_type || "").trim(),
        mandante: (q.contact_name || "").trim(),
        tipo: q.event_type || "—",
        monto: q.total_amount || 0,
        estado: String(q.quotation_status || ""),
        volvioEl: nueva ? String(nueva.created_at || "") : null,
        volvioNumero: nueva ? nueva.quotation_number || 0 : null,
        volvioId: nueva ? String(nueva.id || "") : null,
        mismaVentaNumero: otra ? otra.quotation_number || 0 : null,
        mismaVentaId: otra ? String(otra.id || "") : null,
        recontactadoEl: q.recontacted_at || null,
        soloPorCliente: !((q.contact_name || "").trim()),
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
