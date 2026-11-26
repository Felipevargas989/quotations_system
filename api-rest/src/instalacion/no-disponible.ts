import { BadRequestException } from '@nestjs/common';
import { hayCotizador } from './instalacion';

// LO QUE DEPENDE DEL COTIZADOR, EN UNA INSTALACIÓN SIN COTIZADOR (Licita).
// Donde lo pide una persona, se dice en palabras; donde lo llama el motor
// por detrás, el que llama pregunta `hayCotizador()` y se lo salta.

export const CODIGO_NO_DISPONIBLE = 'NO_DISPONIBLE_EN_ESTA_INSTALACION';

export const mensajeNoDisponible = (que: string): string =>
  `${que} no está disponible en esta instalación: es parte del cotizador de Eventia.`;

/** El error que ve la persona: 400 con un código propio, con la misma forma
 *  que `sinPermiso` (`{ codigo, message }`). */
export const noDisponible = (que: string): BadRequestException =>
  new BadRequestException({
    codigo: CODIGO_NO_DISPONIBLE,
    message: mensajeNoDisponible(que),
  });

/** Primera línea de lo que una persona pide y necesita el cotizador. En
 *  Eventia no hace nada. */
export const exigirElCotizador = (que: string): void => {
  if (!hayCotizador()) throw noDisponible(que);
};
