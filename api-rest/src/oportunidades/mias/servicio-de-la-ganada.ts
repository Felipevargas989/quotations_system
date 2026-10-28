import type { ServicioEnElAnalisis } from '../analisis/analisis.repository';

// LAS GANADAS (decisión 100 del doc 17, 28-10): cuándo es el servicio.
// Felipe, al ver juntas las ganadas y las perdidas: "las ganadas deberían
// estar en alguna parte más visible, para que no se me...". En la pestaña
// «Ganadas», las por cumplir van por el próximo día del servicio y, al día
// siguiente del último, pasan a «Cumplidas». Los días salen del último
// análisis de las bases: el primero (fecha_del_servicio_iso, de la IA) y
// los que nombra el texto como lo dicen las bases ("21 de noviembre, 28 de
// noviembre y 12 de diciembre de 2026", "del 2 al 8 de noviembre",
// "30/10/2026").

export interface ServicioDeLaGanada {
  /** Como lo dicen las bases. */
  texto: string;
  /** Los días del servicio (AAAA-MM-DD), de menor a mayor. Vacío si las
   *  bases no dan una fecha: la ganada queda por cumplir. */
  dias: string[];
}

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Como vienen las fechas de Mercado Público: "2-nov.-2026". */
const ABREVIADOS: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  sept: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

const MES = Object.keys(MESES).join('|');
const ANIO = String.raw`(?:\s+(?:de|del)\s+(\d{4})|\s+(\d{4}))?`;

/** "del 2 al 8 de noviembre": todos los días entre medio. */
const RANGO = new RegExp(
  String.raw`\b(\d{1,2})\s+al\s+(\d{1,2})\s+(?:de\s+)?(${MES})\b${ANIO}`,
  'gi',
);
/** "28 de octubre de 2026", "28 de octubre 2026", "19 noviembre". */
const DIA_Y_MES = new RegExp(
  String.raw`\b(\d{1,2})\s+(?:de\s+)?(${MES})\b${ANIO}`,
  'gi',
);
/** "30/10/2026", "02-11-2026". */
const NUMERICA = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g;
const ABREVIADA = new RegExp(
  String.raw`\b(\d{1,2})-(${Object.keys(ABREVIADOS).join('|')})\.?-(\d{4})\b`,
  'gi',
);

/** Cómo se llama la fecha del servicio entre las fechas de un análisis de
 *  antes del 17-10, que no trae `fecha_del_servicio`: la misma búsqueda que
 *  «En una mirada» (fechaDelEvento, en la vitrina). */
const FECHA_DEL_SERVICIO = [
  /^fecha del (servicio|evento)/i,
  /(realizaci|ejecuci)[oó]n del (servicio|evento)/i,
  /fecha.*(servicio|evento)/i,
];

interface Encontrada {
  indice: number;
  dia: number;
  mes: number;
  anio: number | null;
  /** El último día de un rango ("del 2 al 8"). */
  hasta?: number;
}

const anioDe = (s: string | undefined): number | null => {
  const n = Number(s);
  return s && n >= 2000 && n <= 2100 ? n : null;
};

/** AAAA-MM-DD, o null si el día no existe (un 31 de noviembre). */
const aIso = (anio: number, mes: number, dia: number): string | null => {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia
    ? f.toISOString().slice(0, 10)
    : null;
};

const unMesAntes = (dia: string): string =>
  new Date(Date.parse(dia) - 31 * 86_400_000).toISOString().slice(0, 10);

function leer(texto: string): Encontrada[] {
  const r: Encontrada[] = [];
  for (const m of texto.matchAll(RANGO)) {
    r.push({
      indice: m.index ?? 0,
      dia: Number(m[1]),
      hasta: Number(m[2]),
      mes: MESES[m[3].toLowerCase()],
      anio: anioDe(m[4] ?? m[5]),
    });
  }
  for (const m of texto.matchAll(DIA_Y_MES)) {
    r.push({
      indice: m.index ?? 0,
      dia: Number(m[1]),
      mes: MESES[m[2].toLowerCase()],
      anio: anioDe(m[3] ?? m[4]),
    });
  }
  for (const m of texto.matchAll(NUMERICA)) {
    r.push({
      indice: m.index ?? 0,
      dia: Number(m[1]),
      mes: Number(m[2]),
      anio: anioDe(m[3]),
    });
  }
  for (const m of texto.matchAll(ABREVIADA)) {
    r.push({
      indice: m.index ?? 0,
      dia: Number(m[1]),
      mes: ABREVIADOS[m[2].toLowerCase()],
      anio: anioDe(m[3]),
    });
  }
  return r.sort((a, b) => a.indice - b.indice);
}

/** Los días que nombra el texto, más el primero que dio la IA. Un día sin
 *  año toma el que viene después en el texto ("21 de noviembre y 12 de
 *  diciembre de 2026"); si no hay, el del primer día o el de la
 *  referencia (el cierre), y si así queda más de un mes antes, el del año
 *  siguiente (de diciembre a enero). */
export function diasDelServicio(
  texto: string,
  primerDia: string | null,
  referencia: string | null,
): string[] {
  const ancla = primerDia ?? referencia?.slice(0, 10) ?? null;
  const encontradas = leer(texto);
  const dias = new Set<string>(primerDia ? [primerDia] : []);
  for (const e of encontradas) {
    const despues =
      encontradas.find((o) => o.indice > e.indice && o.anio !== null)?.anio ??
      null;
    const anio = e.anio ?? despues;
    if (anio === null && !ancla) continue;
    const supuesto = anio ?? Number(ancla?.slice(0, 4));
    const hasta =
      e.hasta && e.hasta >= e.dia && e.hasta - e.dia <= 31 ? e.hasta : e.dia;
    for (let d = e.dia; d <= hasta; d++) {
      let dia = aIso(supuesto, e.mes, d);
      if (dia && anio === null && ancla && dia < unMesAntes(ancla)) {
        dia = aIso(supuesto + 1, e.mes, d);
      }
      if (dia) dias.add(dia);
    }
  }
  return [...dias].sort();
}

/** Cuándo es el servicio según lo que dicen las bases. */
export const textoDelServicio = (r: ServicioEnElAnalisis): string => {
  const directo =
    typeof r.fecha_del_servicio === 'string' ? r.fecha_del_servicio.trim() : '';
  if (directo) return directo;
  const fechas = Array.isArray(r.fechas)
    ? (r.fechas as Array<{ que?: unknown; cuando?: unknown }>)
    : [];
  for (const patron of FECHA_DEL_SERVICIO) {
    const f = fechas.find(
      (x) => typeof x?.que === 'string' && patron.test(x.que),
    );
    if (typeof f?.cuando === 'string' && f.cuando.trim()) {
      return f.cuando.trim();
    }
  }
  return '';
};

/** El servicio de una ganada, de su último análisis listo. null si no hay
 *  análisis o no dice cuándo. `referencia`: el cierre del proceso. */
export function servicioDe(
  analisis: ServicioEnElAnalisis | undefined,
  referencia: string | null,
): ServicioDeLaGanada | null {
  if (!analisis) return null;
  const texto = textoDelServicio(analisis);
  const iso = analisis.fecha_del_servicio_iso;
  const primerDia =
    typeof iso === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
    aIso(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8)))
      ? iso
      : null;
  if (!texto && !primerDia) return null;
  return { texto, dias: diasDelServicio(texto, primerDia, referencia) };
}
