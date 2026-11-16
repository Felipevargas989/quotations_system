import type { TurnoDeCaja } from './caja.repository';

/**
 * LA APERTURA CONTRA EL CIERRE ANTERIOR (doc 19 §9.53). Felipe, 16-11:
 * *"de un dia a otro a menos que se haya hecho un retiro, debe concidier el
 * saldo de cierre del ultimo cierre con la apertura siguiente, si no en el
 * inter, se pierde el dinero"*. Puro, sin base.
 *
 * - El anterior: el turno CERRADO de la misma empresa y la misma caja que
 *   se abrió inmediatamente antes (por `abierta_en`).
 * - La diferencia es el sencillo inicial menos el efectivo que declaró ese
 *   cierre: positiva sobra, negativa falta, cero calza.
 * - El primer turno de la historia (sin anterior) no se compara: nulo.
 * - Solo lo ve quien revisa: recepción abre a ciegas.
 */

export interface AperturaComparada {
  /** El efectivo que declaró el cierre anterior. */
  cierre_anterior: number;
  /** Sencillo inicial − cierre anterior. */
  diferencia: number;
}

type ParaComparar = Pick<
  TurnoDeCaja,
  'id' | 'caja' | 'abierta_en' | 'cerrada_en' | 'declarado_efectivo'
>;

/** El turno cerrado de la misma caja abierto justo antes de `turno`, dentro
 *  de `turnos` (en cualquier orden). */
export const turnoAnteriorEn = <T extends ParaComparar>(
  turno: ParaComparar,
  turnos: T[],
): T | null => {
  let anterior: T | null = null;
  for (const t of turnos)
    if (
      t.id !== turno.id &&
      t.caja === turno.caja &&
      t.cerrada_en != null &&
      t.abierta_en < turno.abierta_en &&
      (!anterior || t.abierta_en > anterior.abierta_en)
    )
      anterior = t;
  return anterior;
};

export const compararApertura = (
  turno: Pick<TurnoDeCaja, 'sencillo_inicial'>,
  anterior: Pick<TurnoDeCaja, 'declarado_efectivo'> | null,
): AperturaComparada | null => {
  if (!anterior || anterior.declarado_efectivo == null) return null;
  const cierre = Number(anterior.declarado_efectivo);
  return {
    cierre_anterior: cierre,
    diferencia: Number(turno.sencillo_inicial) - cierre,
  };
};
