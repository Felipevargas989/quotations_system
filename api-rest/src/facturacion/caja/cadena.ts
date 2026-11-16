import type { AperturaComparada } from './apertura';
import type { LineaDelCuadre } from './cuadre';

/**
 * LA CADENA DEL EFECTIVO (doc 19 §9.54). Felipe, 16-11, mirando la lista de
 * cierres: *"para que el abrió con tenga sentido necesitamos otra que diga
 * cerró con o no? … mira cómo debo leer esto?"*. Puro, sin base.
 *
 * - Cada turno, solo en efectivo: con cuánto abrió, cuánto debía tener
 *   (sencillo + vendido en efectivo + ingresos − retiros) y con cuánto cerró
 *   (lo declarado), y la diferencia (cerró con − debía tener). Aparte, la
 *   diferencia sumada de débito, crédito y transferencia.
 * - Con la caja abierta, nada de eso: el esperado no se muestra.
 * - Las tres cifras de arriba, sobre los turnos abiertos en los últimos 7
 *   días corridos (desde ahora − 7 × 24 h): el efectivo que falta (la suma de
 *   las diferencias de efectivo de los cerrados), lo perdido entre turnos (la
 *   suma de las aperturas con menos que el cierre anterior) y cuántos están
 *   por revisar.
 */

export const DIAS_DEL_RESUMEN = 7;

export interface CadenaDelTurno {
  /** Efectivo esperado; nulo con la caja abierta. */
  debia_tener: number | null;
  /** Efectivo declarado; nulo con la caja abierta. */
  cerro_con: number | null;
  /** cerró con − debía tener; nulo con la caja abierta. */
  diferencia_efectivo: number | null;
  /** La diferencia sumada de débito, crédito y transferencia; nula con la
   *  caja abierta. */
  diferencia_otros: number | null;
}

export const cadenaDelTurno = (
  cerrado: boolean,
  lineas: Pick<LineaDelCuadre, 'medio' | 'esperado' | 'declarado'>[],
): CadenaDelTurno => {
  const efectivo = lineas.find((l) => l.medio === 'efectivo');
  if (!cerrado || !efectivo || efectivo.declarado == null)
    return {
      debia_tener: null,
      cerro_con: null,
      diferencia_efectivo: null,
      diferencia_otros: null,
    };
  const otros = lineas.filter((l) => l.medio !== 'efectivo');
  return {
    debia_tener: efectivo.esperado,
    cerro_con: efectivo.declarado,
    diferencia_efectivo: efectivo.declarado - efectivo.esperado,
    diferencia_otros: otros.reduce(
      (s, l) => s + ((l.declarado ?? 0) - l.esperado),
      0,
    ),
  };
};

export interface FilaParaElResumen {
  abierta_en: string;
  estado: 'abierta' | 'por_revisar' | 'revisada';
  diferencia_efectivo: number | null;
  apertura: AperturaComparada | null;
}

export interface ResumenDeLaCadena {
  desde: string;
  /** La suma de las diferencias de efectivo de los cerrados (negativa
   *  falta, positiva sobra). */
  efectivo_que_falta: number;
  /** La suma de las aperturas con menos que el cierre anterior (≤ 0). */
  perdido_entre_turnos: number;
  por_revisar: number;
}

export const desdeDelResumen = (ahora: Date) =>
  new Date(ahora.getTime() - DIAS_DEL_RESUMEN * 24 * 60 * 60 * 1000);

export const resumenDeLaCadena = (
  filas: FilaParaElResumen[],
  ahora: Date,
): ResumenDeLaCadena => {
  const desde = desdeDelResumen(ahora).toISOString();
  const enLaVentana = filas.filter(
    (f) => Date.parse(f.abierta_en) >= Date.parse(desde),
  );
  return {
    desde,
    efectivo_que_falta: enLaVentana.reduce(
      (s, f) => s + (f.diferencia_efectivo ?? 0),
      0,
    ),
    perdido_entre_turnos: enLaVentana.reduce(
      (s, f) =>
        s +
        (f.apertura && f.apertura.diferencia < 0 ? f.apertura.diferencia : 0),
      0,
    ),
    por_revisar: enLaVentana.filter((f) => f.estado === 'por_revisar').length,
  };
};
