import { ganadoresDe } from './ganadores';
import type { ProcesoDeLaZona } from './mercado';

// SI SE REPITE, SEGÚN LA IA (decisión 63 del doc 17, 20-10). Felipe: "dos
// licitaciones con nombres similares, con montos similares, debería ser
// considerado una repetición; por eso es que usamos IA y no un bot... para
// que si el nombre cambia un poco, identifique que son las mismas". «Se
// viene» arma sus series por palabras en común (`parecido`): si el nombre
// cambia, la serie se parte y dice «salió una vez». Aquí se le pregunta a
// la IA, con el nombre, la fecha y el monto, cuáles de las licitaciones de
// años anteriores del mismo comprador son ediciones del mismo evento.
// Funciones puras: la llamada está en `LecturaService.edicionesAnteriores`.

const MES = 30 * 24 * 60 * 60 * 1000;

/** Las ediciones anteriores se buscan entre 6 y 40 meses antes de la última
 *  vez: un año atrás o dos, con holgura (y sin la que se volvió a publicar
 *  el mismo año, desierta). */
const DESDE_MESES = 6;
const HASTA_MESES = 40;
const MAX_CANDIDATAS = 40;

export type Candidata = {
  codigo: string;
  nombre: string;
  fecha_publicacion: string;
  monto: number | null;
};

export type Repeticion = {
  /** Los códigos de las ediciones anteriores del mismo evento. */
  anteriores: string[];
  razon: string;
};

const instante = (fecha: string | null): number => {
  const t = fecha ? new Date(fecha).getTime() : NaN;
  return Number.isNaN(t) ? NaN : t;
};

/** El monto de la licitación o, si no lo informó, lo adjudicado. */
export const montoDe = (p: ProcesoDeLaZona): number | null => {
  if (p.monto) return p.monto;
  const adjudicado = ganadoresDe(p.adjudicacion).reduce(
    (suma, g) => suma + (g.monto ?? 0),
    0,
  );
  return adjudicado > 0 ? adjudicado : null;
};

/** Las licitaciones del mismo comprador que podrían ser ediciones
 *  anteriores de `ultima`: entre 6 y 40 meses antes, primero las más
 *  cercanas a «un año antes», hasta 40. */
export const candidatasDe = (
  ultima: ProcesoDeLaZona,
  procesos: readonly ProcesoDeLaZona[],
): Candidata[] => {
  const t = instante(ultima.fecha_publicacion);
  if (!ultima.organismo_codigo || Number.isNaN(t)) return [];
  const unAnioAntes = t - 12 * MES;
  return procesos
    .filter((p) => {
      if (p.codigo === ultima.codigo) return false;
      if (p.organismo_codigo !== ultima.organismo_codigo) return false;
      const tp = instante(p.fecha_publicacion);
      return tp <= t - DESDE_MESES * MES && tp >= t - HASTA_MESES * MES;
    })
    .sort(
      (a, b) =>
        Math.abs(instante(a.fecha_publicacion) - unAnioAntes) -
        Math.abs(instante(b.fecha_publicacion) - unAnioAntes),
    )
    .slice(0, MAX_CANDIDATAS)
    .map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      fecha_publicacion: p.fecha_publicacion as string,
      monto: montoDe(p),
    }));
};

export const INSTRUCCIONES_DE_REPETICION = [
  'Te paso una licitación de Mercado Público (Chile) y otras del mismo comprador, de años anteriores.',
  'Decide cuáles de las anteriores son ediciones del MISMO evento que se repite: la misma actividad, para el mismo público, que el comprador vuelve a contratar.',
  '- El nombre puede cambiar un poco (el año, el orden de las palabras, una palabra más o menos, abreviaturas): sigue siendo el mismo evento.',
  '- Un monto parecido lo confirma. Un monto muy distinto, o un formato distinto (una gala y un día de campo, una cena y un coffee break), puede ser otro evento: decide con el nombre y el monto juntos.',
  '- Otra actividad del mismo comprador (otro programa, otro público, otro servicio) no es el mismo evento, aunque compartan palabras.',
  'Responde los códigos de las ediciones anteriores (ninguno si no hay) y una frase corta en español que diga por qué.',
].join('\n');

export const ESQUEMA_DE_REPETICION = {
  type: 'object',
  properties: {
    anteriores: { type: 'array', items: { type: 'string' } },
    razon: { type: 'string' },
  },
  required: ['anteriores', 'razon'],
  additionalProperties: false,
} as const;

const fecha = (iso: string): string =>
  iso.slice(0, 10).split('-').reverse().join('-');

const pesos = (monto: number | null): string =>
  monto ? `$${Math.round(monto).toLocaleString('es-CL')}` : 'sin monto';

const linea = (c: Candidata): string =>
  `${c.codigo} — ${c.nombre} — ${fecha(c.fecha_publicacion)} — ${pesos(c.monto)}`;

/** Lo que lee la IA: la última vez y las candidatas, una por línea. */
export const preguntaDeRepeticion = (
  ultima: Candidata,
  candidatas: readonly Candidata[],
): string =>
  [
    `La última vez: ${linea(ultima)}`,
    '',
    'Del mismo comprador, en años anteriores:',
    ...candidatas.map((c) => `- ${linea(c)}`),
  ].join('\n');

/** Lo que contestó la IA, revisado: solo códigos de la lista, sin
 *  repetir. null si no se puede usar. */
export const repeticionValida = (
  salida: { anteriores?: unknown; razon?: unknown },
  candidatas: readonly Candidata[],
): Repeticion | null => {
  if (!Array.isArray(salida.anteriores)) return null;
  const validos = new Set(candidatas.map((c) => c.codigo));
  const anteriores = [
    ...new Set(
      salida.anteriores
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.trim())
        .filter((c) => validos.has(c)),
    ),
  ];
  return {
    anteriores,
    razon: typeof salida.razon === 'string' ? salida.razon.trim() : '',
  };
};

/** Los años en que salió: la última vez y sus ediciones anteriores. */
export const aniosConEdiciones = (
  ultima: string,
  ediciones: readonly string[],
  fechaDe: (codigo: string) => string | null,
): number[] => {
  const anios = [ultima, ...ediciones]
    .map((c) => {
      const t = instante(fechaDe(c));
      return Number.isNaN(t) ? null : new Date(t).getUTCFullYear();
    })
    .filter((a): a is number => a !== null);
  return [...new Set(anios)].sort((a, b) => a - b);
};
