import { normalizar } from '../mercado-publico/mapeo';
import { type Ganador, ganadoresDe } from './ganadores';

// EL AÑO ANTERIOR (doc 17, decisión 3: "quién ganó el año anterior, a qué
// valor y con qué servicios"). Funciones puras: las pruebas las cubren.
//
// Una licitación "es la misma del año pasado" si la publicó el mismo
// organismo comprador y su nombre se parece. No se compara la unidad: el Día
// del Funcionario de Quillón salió en 2025 por una unidad (4352) y en 2026
// por otra (1532886), del mismo municipio.

/** Lo que se necesita de un proceso pasado para compararlo. */
export type ProcesoPasado = {
  codigo: string;
  nombre: string;
  organismo_codigo: string | null;
  fecha_publicacion: string | null;
  monto: number | null;
  adjudicacion: {
    oferentes?: number | null;
    url_acta?: string | null;
    ganadores?: Array<{
      nombre?: string | null;
      rut?: string | null;
      cantidad?: number | null;
      monto_unitario?: number | null;
    }>;
  } | null;
};

export type Anterior = {
  codigo: string;
  nombre: string;
  anio: number | null;
  oferentes: number | null;
  url_acta: string | null;
  /** Quién ganó y por cuánto (suma de lo adjudicado a cada uno); con su
   *  RUT, la pantalla enlaza a la ficha del competidor. */
  ganadores: Ganador[];
};

/** Palabras que no dicen nada del objeto de la compra. */
const VACIAS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'e',
  'o',
  'u',
  'en',
  'para',
  'por',
  'con',
  'a',
  'al',
  'un',
  'una',
  'su',
  'sus',
  'que',
  'se',
  'lo',
  'servicio',
  'servicios',
  'adquisicion',
  'contratacion',
  'compra',
  'licitacion',
  'municipalidad',
  'ilustre',
  'comuna',
  'ano',
  'anos',
]);

export const palabrasDe = (nombre: string): Set<string> =>
  new Set(
    normalizar(nombre)
      .split(' ')
      .filter((p) => p.length > 2 && !VACIAS.has(p) && !/^\d+$/.test(p)),
  );

/** Cuánto se parecen dos nombres: palabras en común sobre palabras en
 *  total (0 a 1). */
export const parecido = (a: string, b: string): number => {
  const pa = palabrasDe(a);
  const pb = palabrasDe(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  return comunes / (pa.size + pb.size - comunes);
};

const PARECIDO_MINIMO = 0.3;
const MES = 30 * 24 * 60 * 60 * 1000;

const anioDe = (fecha: string | null): number | null => {
  const t = fecha ? new Date(fecha) : null;
  return t && !Number.isNaN(t.getTime()) ? t.getUTCFullYear() : null;
};

/** La compra del año anterior (entre 6 y 30 meses antes), si la hay: del
 *  mismo organismo, adjudicada, con el nombre más parecido. */
export const anteriorDe = (
  proceso: {
    codigo: string;
    nombre: string;
    organismo_codigo: string | null;
    fecha_publicacion: string | null;
  },
  pasados: ProcesoPasado[],
): Anterior | null => {
  if (!proceso.organismo_codigo) return null;
  const base = proceso.fecha_publicacion
    ? new Date(proceso.fecha_publicacion).getTime()
    : Date.now();
  let mejor: { p: ProcesoPasado; puntaje: number; t: number } | null = null;
  for (const p of pasados) {
    if (p.codigo === proceso.codigo) continue;
    if (p.organismo_codigo !== proceso.organismo_codigo) continue;
    if (!p.adjudicacion?.ganadores?.length) continue;
    const t = p.fecha_publicacion
      ? new Date(p.fecha_publicacion).getTime()
      : NaN;
    if (Number.isNaN(t) || t > base - 6 * MES || t < base - 30 * MES) continue;
    const puntaje = parecido(proceso.nombre, p.nombre);
    if (puntaje < PARECIDO_MINIMO) continue;
    if (
      !mejor ||
      puntaje > mejor.puntaje ||
      (puntaje === mejor.puntaje && t > mejor.t)
    ) {
      mejor = { p, puntaje, t };
    }
  }
  if (!mejor) return null;

  return {
    codigo: mejor.p.codigo,
    nombre: mejor.p.nombre,
    anio: anioDe(mejor.p.fecha_publicacion),
    oferentes: mejor.p.adjudicacion?.oferentes ?? null,
    url_acta: mejor.p.adjudicacion?.url_acta ?? null,
    ganadores: ganadoresDe(mejor.p.adjudicacion),
  };
};

/** Lo pasado agrupado por organismo, para comparar cada proceso solo con
 *  lo de su mismo comprador. */
export const indexarPorOrganismo = (
  pasados: ProcesoPasado[],
): Map<string, ProcesoPasado[]> => {
  const indice = new Map<string, ProcesoPasado[]>();
  for (const p of pasados) {
    if (!p.organismo_codigo) continue;
    const grupo = indice.get(p.organismo_codigo);
    if (grupo) grupo.push(p);
    else indice.set(p.organismo_codigo, [p]);
  }
  return indice;
};
