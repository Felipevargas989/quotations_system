import { isEmail } from 'class-validator';
import { mensajeRut, normalizarRut, revisarRut } from '../../people/utils/rut';
import { correosDe } from '../datos-del-receptor';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
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

/** Los correos del receptor, separados por coma. Vacío si no hay. En el
 *  ambiente de prueba de facturacion.cl van vacíos (L11): el laboratorio
 *  tiene los correos de clientes reales y no se le escribe a nadie. */
export const correosDelReceptor = (
  correo: string | null | undefined,
  avisos: Avisos,
  problemas: string[],
  ambiente?: AmbienteDeFacturacion,
): string => {
  const correos = correosDe(correo);
  const malo = correos.find((c) => !isEmail(c));
  if (malo) {
    problemas.push(`El correo «${malo}» no es válido`);
    return '';
  }
  if (ambiente === 'prueba' && correos.length) {
    avisos.agregar(
      'En el ambiente de prueba el correo va vacío: facturacion.cl no le manda el documento a nadie',
    );
    return '';
  }
  return avisos.campo('Los correos', correos.join(','), 200);
};

/** El descuento de una línea, al peso: su % de cantidad por precio, como
 *  lo cuenta el SII (DescuentoMonto). Sin descuento, 0. */
export const descuentoDeLaLinea = (linea: LineaDeDetalle): number =>
  linea.descuento
    ? Math.round((linea.cantidad * linea.precio * linea.descuento) / 100)
    : 0;

/** El valor de una línea: cantidad por precio, al peso, menos su
 *  descuento. */
export const valorDeLaLinea = (linea: LineaDeDetalle): number =>
  Math.round(linea.cantidad * linea.precio) - descuentoDeLaLinea(linea);

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
  if (
    linea.descuento != null &&
    (!Number.isFinite(linea.descuento) ||
      linea.descuento < 0 ||
      linea.descuento >= 100)
  )
    problemas.push(`El descuento de la línea ${n} va de 0 a menos de 100 %`);
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
