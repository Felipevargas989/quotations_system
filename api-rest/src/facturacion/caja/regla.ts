import { ConflictException } from '@nestjs/common';
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
