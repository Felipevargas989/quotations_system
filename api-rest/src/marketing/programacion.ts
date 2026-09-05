import type { AudienciaDeCampana } from './marketing.repository';

/**
 * PROGRAMAR ENVÍO — la recomendación de horario por audiencia
 * (04-09-2026, capítulo "Programar envío" del doc 11).
 *
 * Dos fuentes, en este orden:
 * 1. El HISTORIAL PROPIO: las aperturas reales (opened_at, migración
 *    92) de campañas pasadas a esa audiencia, agrupadas por día de
 *    semana y bloque de 2 horas en hora de Chile. Con 30 o más
 *    aperturas, manda el dato.
 * 2. Los ESTUDIOS, según el público de la audiencia: el de OFICINA
 *    abre con la bandeja fresca del escritorio; el de CASA revisa el
 *    celular en la tarde (el paseo de curso lo cotiza el apoderado,
 *    no el colegio — regla de Felipe).
 */

export type Publico = 'oficina' | 'casa';

/** Umbral para que el dato propio le gane a los estudios. */
export const UMBRAL_APERTURAS = 30;

export const RECOMENDACION_ESTUDIOS: Record<Publico, string> = {
  oficina:
    'Martes o jueves, 9:30–11:00 — llegan al escritorio con la bandeja fresca.',
  casa: 'Martes a jueves, 17:00–19:00 — el celular en la casa.',
};

const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Las señales de que un tipo de cliente trabaja de oficina. */
const DE_OFICINA = [
  'empresa',
  'colegio',
  'universidad',
  'convenio',
  'instituc',
  'tour',
  'public',
  'municip',
];

const esDeOficina = (tipo: string): boolean => {
  const t = sinTildes(tipo.toLowerCase());
  return DE_OFICINA.some((señal) => t.includes(señal));
};

/**
 * El público de una audiencia, por sus señales: los tipos de cliente
 * (audiencia de la base o segmento) o el nombre de la importada.
 * Solo si TODAS las señales son de oficina se recomienda la ventana
 * de oficina; con mezcla o sin señales, la de casa — es el respaldo
 * seguro (la tarde también alcanza a la gente de escritorio).
 */
export const publicoDeAudiencia = (a: AudienciaDeCampana): Publico => {
  const tipos =
    a.tipos_cliente ??
    ((a.filtro?.tipos_cliente as string[] | undefined) || null);
  if (tipos && tipos.length > 0) {
    return tipos.every(esDeOficina) ? 'oficina' : 'casa';
  }
  if (a.audiencia_ref && esDeOficina(a.audiencia_ref)) return 'oficina';
  return 'casa';
};

/** Un rótulo legible de la audiencia, mejor esfuerzo. */
export const rotuloDeAudiencia = (a: AudienciaDeCampana): string => {
  if (a.audiencia_ref) return a.audiencia_ref;
  const tipos =
    a.tipos_cliente ??
    ((a.filtro?.tipos_cliente as string[] | undefined) || null);
  if (tipos && tipos.length > 0) return tipos.join(', ');
  return a.audiencia_tipo === 'segmento' ? 'Segmento de tu base' : 'Clientes';
};

const DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/** (día de semana, hora) de un instante, en hora de Chile. */
const enChile = (iso: string): { dow: number; hora: number } => {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const dias: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    dow: dias[f.find((p) => p.type === 'weekday')?.value ?? 'Sun'] ?? 0,
    hora: Number(f.find((p) => p.type === 'hour')?.value ?? 0),
  };
};

/**
 * La ventana con más aperturas: día de semana × bloque de 2 horas.
 * Devuelve null sin datos. El umbral lo decide quien llama.
 */
export const mejorVentana = (
  aperturas: readonly string[],
): { texto: string; aperturas: number } | null => {
  if (aperturas.length === 0) return null;
  const conteo = new Map<string, number>();
  for (const iso of aperturas) {
    const { dow, hora } = enChile(iso);
    const bloque = Math.floor(hora / 2) * 2;
    const k = `${String(dow)}|${String(bloque)}`;
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }
  const [ganadora] = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  const [dow, bloque] = ganadora[0].split('|').map(Number);
  return {
    texto: `los ${DIAS[dow]} entre ${String(bloque)} y ${String(bloque + 2)} h`,
    aperturas: aperturas.length,
  };
};
