// LOS DÍAS DEL EVENTO, CON SU DÍA DE LA SEMANA Y SU TEMPORADA.
//
// Se calculan acá y no se le piden a la IA: el día de la semana decide la
// exclusividad (lunes a jueves o viernes a domingo) y la temporada decide
// el alojamiento de cada noche. Un día de la semana mal sacado es el error
// que más se nota (skill de correos, "revisar antes de escribir").
//
// Las fechas viajan como AAAA-MM-DD y se cuentan en UTC: así se guardan
// los eventos (medianoche UTC, mapa 01 regla 29), y en hora chilena se
// correrían un día.

export type Temporada = 'baja' | 'media' | 'alta';

export type DiaDelEvento = {
  dia: number;
  fecha: string;
  semana: string;
  temporada: Temporada;
};

const SEMANA = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/** Máximo de días de un evento: el mismo tope del cotizador. */
export const MAX_DIAS = 60;

const aFecha = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export const esFechaValida = (iso: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(aFecha(iso).getTime());

export const sumarDias = (iso: string, n: number): string => {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Días entre dos fechas (fin − inicio). */
export const diasEntre = (inicio: string, fin: string): number =>
  Math.round((aFecha(fin).getTime() - aFecha(inicio).getTime()) / 86_400_000);

/**
 * Temporadas de alojamiento de Valle del Sol (doc 16, regla 8): baja del
 * 01-03 al 31-08, media del 01-09 al 15-12 y alta del 16-12 al 28-02 (el
 * 16 al 31 de diciembre es alta: regla de Felipe).
 */
export const temporadaDe = (iso: string): Temporada => {
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  if (mes >= 3 && mes <= 8) return 'baja';
  if (mes >= 9 && mes <= 11) return 'media';
  if (mes === 12 && dia <= 15) return 'media';
  return 'alta';
};

export const diaDeLaSemana = (iso: string): string =>
  SEMANA[aFecha(iso).getUTCDay()];

/** "sábado 12-12-2026" */
export const fechaLegible = (iso: string): string =>
  `${diaDeLaSemana(iso)} ${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Los días del evento, del primero al último (un solo día si no hay fin). */
export function diasDelEvento(
  inicio: string,
  fin?: string | null,
): DiaDelEvento[] {
  const total =
    fin && esFechaValida(fin)
      ? Math.min(Math.max(diasEntre(inicio, fin) + 1, 1), MAX_DIAS)
      : 1;
  return Array.from({ length: total }, (_, i) => {
    const fecha = sumarDias(inicio, i);
    return {
      dia: i + 1,
      fecha,
      semana: diaDeLaSemana(fecha),
      temporada: temporadaDe(fecha),
    };
  });
}
