import { isEmail } from 'class-validator';
import { mensajeRut, normalizarRut, revisarRut } from '../../people/utils/rut';
import { correosDe } from '../datos-del-receptor';
import { Avisos, numeroDelArchivo } from './texto';
import type { LineaDeDetalle } from './tipos';

/** El RUT que el SII da para la boleta de quien no da el suyo. */
export const RUT_AUXILIAR = '66666666-6';

/**
 * El RUT del receptor, limpio (sin puntos, con guion y la K mayúscula). Si
 * no sirve, anota el problema. `auxiliarPermitido`: solo la boleta acepta
 * el 66666666-6.
 */
export const rutDelReceptor = (
  rut: string | null | undefined,
  problemas: string[],
  auxiliarPermitido = false,
): string => {
  const canonico = normalizarRut(rut ?? '');
  if (auxiliarPermitido && canonico === RUT_AUXILIAR) return RUT_AUXILIAR;
  const problema = revisarRut(rut ?? '');
  if (problema) {
    problemas.push(`RUT del cliente: ${mensajeRut(problema)}`);
    return '';
  }
  return canonico ?? '';
};

/** Los correos del receptor, separados por coma. Vacío si no hay. */
export const correosDelReceptor = (
  correo: string | null | undefined,
  avisos: Avisos,
  problemas: string[],
): string => {
  const correos = correosDe(correo);
  const malo = correos.find((c) => !isEmail(c));
  if (malo) {
    problemas.push(`El correo «${malo}» no es válido`);
    return '';
  }
  return avisos.campo('Los correos', correos.join(','), 200);
};

/** El valor de una línea: cantidad por precio, al peso. */
export const valorDeLaLinea = (linea: LineaDeDetalle): number =>
  Math.round(linea.cantidad * linea.precio);

/** Revisa una línea del detalle; anota lo que no sirve. */
export const revisarLinea = (
  linea: LineaDeDetalle,
  n: number,
  problemas: string[],
): boolean => {
  const antes = problemas.length;
  if (!linea.descripcion || !linea.descripcion.trim())
    problemas.push(`La línea ${n} no tiene descripción`);
  if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0)
    problemas.push(`La línea ${n} necesita una cantidad mayor que cero`);
  if (!Number.isFinite(linea.precio) || linea.precio < 0)
    problemas.push(`La línea ${n} tiene un precio que no sirve`);
  return problemas.length === antes;
};

/** Cantidad y precio como los pide el archivo (hasta 6 decimales). */
export const cantidadYPrecio = (linea: LineaDeDetalle): [string, string] => [
  numeroDelArchivo(linea.cantidad),
  numeroDelArchivo(linea.precio),
];

/** Las observaciones: 3 líneas de 60 caracteres como máximo. */
export const observacionesDelArchivo = (
  observaciones: string[] | null | undefined,
  avisos: Avisos,
): string[] => {
  const lineas = (observaciones ?? [])
    .map((o, i) => avisos.campo(`La observación ${i + 1}`, o, 60))
    .filter(Boolean);
  if (lineas.length > 3) {
    avisos.agregar(
      `Caben 3 líneas de observaciones: ${lineas.length - 3} no sale${lineas.length - 3 > 1 ? 'n' : ''}`,
    );
  }
  return lineas.slice(0, 3);
};
