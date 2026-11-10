import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole, type User } from 'src/users/entities/user.entity';
import type { CajaRepository } from './caja.repository';

/**
 * LO QUE EMITE RECEPCIÓN ENTRA A SU CAJA (doc 19 §9.43, sprint 2).
 *
 * Felipe, 09-11: *"la recepcionista que boletee tendrá que rendir lo que
 * vendió"*, y en la propuesta aprobada, *"sin la caja abierta, recepción no
 * emite"*. La boleta y la factura de recepción entran al turno abierto; sin
 * caja abierta, no se envían. Los otros cargos emiten sin
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
 * recepción van como solicitud (`POST /facturacion/solicitudes/…`) y las
 * emite quien tiene «Aprobar y emitir solicitudes». Las puertas de emitir
 * se lo dicen a recepción aunque la llame otra pantalla.
 */
export const RECEPCION_SOLICITA =
  'Recepción no emite: envía la solicitud y la emite quien la aprueba en «Solicitudes».';

export const recepcionSolicita = (user: User) => {
  if (user.role === UserRole.RECEPCION)
    throw new ForbiddenException(RECEPCION_SOLICITA);
};

/**
 * LA VENTA NO DEPENDE DEL DOCUMENTO (doc 19 §9.46; Felipe, 10-11: *"para
 * efecto de contabilizar la venta, no incide la emisión del documento"*).
 * Recepción anota siempre con qué le pagaron, también en la factura, diga
 * lo que diga su condición de pago: así su venta entra a la caja del turno
 * igual que la de una boleta. Los otros cargos, como antes (el medio, solo
 * al contado).
 */
export const conElMedioDeRecepcion = <
  P extends { medio_de_pago?: M | null },
  M,
>(
  user: User,
  pedida: P,
  medio: M | null | undefined,
): P =>
  user.role === UserRole.RECEPCION
    ? { ...pedida, medio_de_pago: medio ?? null }
    : pedida;

/** A la revisión de la factura de recepción le falta el medio de pago si
 *  no viene (la revisión de siempre solo lo pide al contado). */
export const conElMedioExigido = <
  V extends { ok: boolean; faltan: { campo: string; texto: string }[] },
>(
  user: User,
  medio: unknown,
  revision: V,
): V =>
  user.role !== UserRole.RECEPCION ||
  medio ||
  revision.faltan.some((f) => f.campo === 'medio_de_pago')
    ? revision
    : {
        ...revision,
        ok: false,
        faltan: [
          ...revision.faltan,
          { campo: 'medio_de_pago', texto: 'el medio de pago' },
        ],
      };
