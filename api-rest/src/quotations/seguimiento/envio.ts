// CUANDO EL BORRADOR SALE (doc 18 §9; Felipe, 17-10-2026).
//
// "Dejemos en 14 días siguiente contacto por correo; 2 correos sin
// respuesta pasa a calendarizarse un llamado a la siguiente semana." Al
// ver que el borrador salió, Eventia anota el envío en la bitácora con el
// próximo contacto. El tipo de esa nota ES el tipo del próximo contacto
// (Felipe, con la 607): correo, o llamada cuando ya van dos.

import { sumarDias } from '../generar/fechas';
import { ddmm, fechaEnChile } from './elegibles';

export const DIAS_HASTA_EL_PROXIMO_CORREO = 14;
export const DIAS_HASTA_LA_LLAMADA = 7;
/** Desde cuántos seguimientos sin respuesta lo que sigue es llamar. */
export const SEGUIMIENTOS_ANTES_DE_LLAMAR = 2;

export type ProximoContacto = {
  tipo: 'correo' | 'llamada';
  /** AAAA-MM-DD, día de Chile. */
  fecha: string;
};

export function proximoTrasElEnvio(
  enviado: string,
  sinRespuesta: number,
): ProximoContacto {
  const dia = fechaEnChile(new Date(enviado));
  return sinRespuesta >= SEGUIMIENTOS_ANTES_DE_LLAMAR
    ? { tipo: 'llamada', fecha: sumarDias(dia, DIAS_HASTA_LA_LLAMADA) }
    : { tipo: 'correo', fecha: sumarDias(dia, DIAS_HASTA_EL_PROXIMO_CORREO) };
}

/** La línea de la bitácora, a nombre de «Asistente»: una línea, sin cifras
 *  ni datos del cliente. Sin próximo contacto si el negocio ya no está
 *  vivo (se aceptó o se perdió mientras el borrador esperaba). */
export function notaDelEnvio(p: {
  buzon: string;
  enviado: string;
  /** Salió el borrador de la IA, o se borró y salió otro escrito a mano. */
  conElBorrador: boolean;
  sinRespuesta: number;
  proximo: ProximoContacto | null;
}): string {
  const buzon = `${p.buzon.split('@')[0]}@`;
  const dia = ddmm(fechaEnChile(new Date(p.enviado)));
  const que = p.conElBorrador
    ? `Seguimiento con IA enviado desde ${buzon} el ${dia}.`
    : `Se envió un seguimiento en el hilo de ${buzon} el ${dia} (el borrador de la IA no se usó).`;
  if (!p.proximo) return que;
  if (p.proximo.tipo === 'llamada') {
    return `${que} Van ${p.sinRespuesta} seguimientos por correo sin respuesta: toca llamar el ${ddmm(p.proximo.fecha)}.`;
  }
  return `${que} Próximo contacto por correo el ${ddmm(p.proximo.fecha)}, en ${DIAS_HASTA_EL_PROXIMO_CORREO} días.`;
}
