import type { ArchivoDelSet, Carpeta, PiezaDelSet } from './el-set';
import { esLaCotizacionDetallada } from './la-cotizacion-detallada';
import {
  normalizar,
  type PapelSinFormato,
  quienLoHace,
  type TipoDeDeclaracion,
} from './los-papeles';

// LOS PAPELES SIN FORMATO EN EL SET (decisión 119, parte 3b, 08-11). Desde
// la parte 3b la cotización, la propuesta y cada declaración llevan el
// nombre que les dan las bases: el set las reconoce por el trabajo que las
// hizo (la oferta o la propuesta), no por el nombre, y cada papel que las
// bases piden sin formato cuenta como hecho si va la pieza que lo cubre.
// Aparte de `el-set.ts`, que está en el tope de 800 líneas.

/** Lo que hizo el motor con la oferta: la cotización o una declaración
 *  (con su tipo). null si no lo hizo el motor. Sin el tipo de cada
 *  trabajo, la cotización se reconoce por su nombre, como antes. */
export const deLaOferta = (
  g: Pick<ArchivoDelSet, 'nombre' | 'generacion_id'>,
  tipoDe: ReadonlyMap<number, string> | undefined,
): 'cotizacion' | `declaracion-${TipoDeDeclaracion}` | null => {
  const tipo = g.generacion_id != null ? tipoDe?.get(g.generacion_id) : null;
  if (tipo === 'oferta') {
    const q = quienLoHace(g.nombre);
    return q?.quien === 'declaracion' ? `declaracion-${q.tipo}` : 'cotizacion';
  }
  return esLaCotizacionDetallada(g.nombre) ? 'cotizacion' : null;
};

/** ¿Lo hizo el trabajo de la propuesta técnica? */
export const deLaPropuesta = (
  g: Pick<ArchivoDelSet, 'generacion_id'>,
  tipoDe: ReadonlyMap<number, string> | undefined,
): boolean =>
  g.generacion_id != null && tipoDe?.get(g.generacion_id) === 'propuesta';

const CARPETA_DE_LA_PARTE: Readonly<Record<string, Carpeta>> = {
  administrativa: 'administrativa',
  tecnica: 'tecnica',
  economica: 'economica',
  otra: 'otros',
};

/** La carpeta de una declaración: la parte en que las bases la piden. */
export const carpetaDeLaDeclaracion = (
  nombre: string,
  papeles: PapelSinFormato[],
): Carpeta => {
  const q = quienLoHace(nombre);
  const papel =
    q?.quien === 'declaracion'
      ? papeles.find(
          (p) => p.quien?.quien === 'declaracion' && p.quien.tipo === q.tipo,
        )
      : undefined;
  return CARPETA_DE_LA_PARTE[papel?.parte ?? ''] ?? 'administrativa';
};

/** ¿Va en el set lo que cubre este papel? La cotización, la propuesta o
 *  la misma declaración, hecha por Eventia o subida a mano. Lo del portal
 *  y lo que no aplica no se sube. */
export const cubierto = (papel: PapelSinFormato, piezas: PiezaDelSet[]) => {
  const q = papel.quien;
  if (!q) return false;
  if (q.quien === 'portal' || q.quien === 'no_aplica') return true;
  return piezas.some((p) => {
    const suyo = quienLoHace(p.nombre);
    if (q.quien === 'cotizacion') {
      return (
        p.que_es === 'cotizacion' ||
        (p.que_es === 'subido' &&
          (suyo?.quien === 'cotizacion' ||
            /cotizacion/.test(normalizar(p.nombre))))
      );
    }
    if (q.quien === 'propuesta') {
      return (
        p.que_es === 'propuesta' ||
        (p.que_es === 'subido' &&
          (suyo?.quien === 'propuesta' ||
            /propuesta/.test(normalizar(p.nombre))))
      );
    }
    if (q.quien === 'declaracion') {
      return (
        (p.que_es === 'declaracion' || p.que_es === 'subido') &&
        suyo?.quien === 'declaracion' &&
        suyo.tipo === q.tipo
      );
    }
    // Lo que sube la empresa: subido a mano con alguna palabra suya.
    const nombre = normalizar(p.nombre);
    return (
      p.que_es === 'subido' &&
      palabras(papel.nombre).some((x) => nombre.includes(x))
    );
  });
};

const GENERICAS = new Set(
  'certificado certificados documento documentos copia simple vigente vigentes declaracion jurada oferente empresa segun bases desde hasta emitido'.split(
    ' ',
  ),
);

/** Las palabras que distinguen un papel: «permiso», «circulacion»… */
const palabras = (t: string) =>
  normalizar(t)
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length >= 5 && !GENERICAS.has(x));

/** Lo que dice el set de los papeles sin formato que no van: uno por uno
 *  lo que arma Eventia y, en una sola línea, lo que sube la empresa. La
 *  cotización la dice `laCotizacionQueFalta`, y lo de «Mi empresa», su
 *  carpeta. */
export const loQueFaltaDeLosPapeles = (
  papeles: PapelSinFormato[],
): string[] => {
  const faltan: string[] = [];
  const tuyos: string[] = [];
  for (const p of papeles) {
    const q = p.quien;
    if (q?.quien === 'propuesta') {
      faltan.push(
        `Falta «${p.nombre}»: va en la propuesta técnica; vuelve a armar la postulación.`,
      );
    } else if (q?.quien === 'declaracion') {
      faltan.push(
        `Falta «${p.nombre}»: la arma Eventia al armar la postulación; vuelve a armarla.`,
      );
    } else if (q?.quien === 'empresa') {
      tuyos.push(`«${p.nombre}» (${q.porque})`);
    }
  }
  if (tuyos.length > 0) {
    faltan.push(
      `${tuyos.length === 1 ? 'Te falta subir' : `Te faltan ${tuyos.length} papeles que subes tú`} a «Mi postulación»: ${tuyos.join(', ')}.`,
    );
  }
  return faltan;
};
