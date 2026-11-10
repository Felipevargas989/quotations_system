import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole, type User } from 'src/users/entities/user.entity';
import type { CajaRepository } from './caja.repository';

/**
 * LO QUE EMITE RECEPCIÓN ENTRA A SU CAJA (doc 19 §9.43, sprint 2).
 *
 * Felipe, 09-11: *"la recepcionista que boletee tendrá que rendir lo que
 * vendió"*, y en la propuesta aprobada, *"sin la caja abierta, recepción no
 * emite"*. La boleta y la factura al contado de recepción entran al turno
 * abierto; sin caja abierta, no se emiten. Los otros cargos emiten sin
 * turno (su plata no pasa por la caja de recepción). Sin la pieza (algunas
 * pruebas), como antes.
 */
export const CAJA_CERRADA =
  'La caja de recepción está cerrada: ábrela en «Caja» para emitir.';

export const turnoParaEmitir = async (
  user: User,
  caja?: CajaRepository,
): Promise<number | null> => {
  if (!caja || user.role !== UserRole.RECEPCION) return null;
  const turno = await caja.turnoAbierto(user.company_id);
  if (!turno) throw new ConflictException(CAJA_CERRADA);
  return turno.id;
};

/**
 * RECEPCIÓN NO EMITE: SOLICITA (doc 19 §9.45; Felipe, 09-11: que recepción
 * no pueda duplicar algo ya boleteado). La boleta y la factura del cargo
 * recepción (al contado o a crédito, §9.46: Felipe, 10-11, «no distingamos
 * si la factura es contado o crédito») van como solicitud (`POST /facturacion/solicitudes/…`)
 * y las emite quien tiene «Aprobar y emitir solicitudes». Las puertas de
 * emitir se lo dicen a recepción aunque la llame otra pantalla.
 */
export const RECEPCION_SOLICITA =
  'Recepción no emite: envía la solicitud y la emite quien la aprueba en «Solicitudes».';

export const recepcionSolicita = (user: User) => {
  if (user.role === UserRole.RECEPCION)
    throw new ForbiddenException(RECEPCION_SOLICITA);
};
