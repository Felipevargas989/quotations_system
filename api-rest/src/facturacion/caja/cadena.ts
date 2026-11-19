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
 *   días corridos (desde ahora − 7 × 24 h): el efectivo que falta (solo las
 *   faltas de los cerrados, sin restarles las sobras y sin lo que apareció
 *   completo en la apertura siguiente; las sobras van aparte, §9.58), lo
 *   perdido entre turnos (la
 *   suma de las aperturas con menos que el cierre anterior) y cuántos están
 *   por revisar. Desde el §9.57, una cuarta: los gastos de esa ventana.
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
  /** §9.58: lo que el turno SIGUIENTE de la misma caja abrió de más sobre
   *  lo que este declaró al cerrar («Aparecieron $X que el cierre anterior
   *  no declaró»). Esa plata no falta: se declaró mal. */
  aparecio_despues?: number;
}

export interface ResumenDeLaCadena {
  desde: string;
  /** §9.58: solo las FALTAS de efectivo de los cerrados (≤ 0), cada una
   *  sin lo que apareció en la apertura siguiente. Las sobras no la bajan. */
  efectivo_que_falta: number;
  /** §9.58: la suma de las SOBRAS de efectivo de los cerrados (≥ 0). */
  efectivo_que_sobra: number;
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
    efectivo_que_falta: enLaVentana.reduce((s, f) => {
      const d = f.diferencia_efectivo ?? 0;
      if (d >= 0) return s;
      // Lo que apareció en la apertura siguiente no falta (§9.58).
      return s + Math.min(0, d + Math.max(0, f.aparecio_despues ?? 0));
    }, 0),
    efectivo_que_sobra: enLaVentana.reduce(
      (s, f) => s + Math.max(0, f.diferencia_efectivo ?? 0),
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

/** §9.57: un gasto de la ventana, como lo lista la tarjeta. */
export interface GastoDelResumen {
  id: number;
  turno_id: number;
  monto: number;
  motivo: string;
  creado_por_nombre: string | null;
  creado_en: string;
}

export interface GastosDelResumen {
  /** La suma de los gastos de la caja de la ventana. */
  gastos: number;
  /** Esos gastos, del más nuevo al más viejo. */
  lista_de_gastos: GastoDelResumen[];
}

/**
 * «GASTOS DE 7 DÍAS» (doc 19 §9.57). Felipe, 19-11, con la maqueta: *"sí me
 * tinca, hagámoslo"*. La misma ventana que las otras tres cifras: los gastos
 * (§9.56) de los turnos abiertos en los últimos 7 días corridos, también el
 * que sigue abierto. Ni los retiros ni los ingresos cuentan.
 */
export const gastosDelResumen = (
  turnos: { id: number; abierta_en: string }[],
  movimientos: {
    id: number;
    turno_id: number;
    tipo: string;
    monto: number;
    motivo: string;
    creado_por_nombre: string | null;
    created_at: string;
  }[],
  ahora: Date,
): GastosDelResumen => {
  const desde = desdeDelResumen(ahora).getTime();
  const enLaVentana = new Set(
    turnos.filter((t) => Date.parse(t.abierta_en) >= desde).map((t) => t.id),
  );
  const lista = movimientos
    .filter((m) => m.tipo === 'gasto' && enLaVentana.has(m.turno_id))
    .map((m) => ({
      id: m.id,
      turno_id: m.turno_id,
      monto: m.monto,
      motivo: m.motivo,
      creado_por_nombre: m.creado_por_nombre,
      creado_en: m.created_at,
    }))
    .sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en));
  return {
    gastos: lista.reduce((s, g) => s + g.monto, 0),
    lista_de_gastos: lista,
  };
};
