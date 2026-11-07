import { BadRequestException } from '@nestjs/common';
import { normalizarRut } from '../people/utils/rut';
import { CODIGOS_DE_REFERENCIA } from './referencias';

/**
 * LOS DATOS DE UNA RAZÓN SOCIAL: A QUIÉN SE FACTURA (migración 184,
 * doc 19 §5.1 y §9.12)
 *
 * ⚠ GEMELO: los largos viven también en
 *   `frontend/src/constants/facturacion.ts`
 * **Si se cambian acá, se cambian allá.**
 *
 * Son los del archivo de facturacion.cl (archivoplano.php, nodo
 * Encabezado). Lo que se guarda en la ficha cabe ENTERO en la factura: la
 * pantalla cuenta los caracteres y nada se corta a escondidas
 * (doc 19 §9.10).
 */
export const LARGO_MAXIMO = {
  razon_social: 100,
  giro: 40,
  direccion: 60,
  comuna: 20,
  ciudad: 20,
  correo_facturacion: 200,
} as const;

export interface DatosDeFacturacion {
  rut?: string | null;
  razon_social?: string | null;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  correo_facturacion?: string | null;
  referencias_exigidas?: string[] | null;
}

const TEXTOS = [
  'razon_social',
  'giro',
  'direccion',
  'comuna',
  'ciudad',
] as const;

/** Los correos de la casilla: separados por coma, punto y coma o espacio. */
export const correosDe = (valor: string | null | undefined): string[] =>
  (valor ?? '')
    .split(/[\s,;]+/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

const textoLimpio = (valor: string | null | undefined): string | null =>
  (valor ?? '').replace(/\s+/g, ' ').trim() || null;

/**
 * Las reglas que se aplican SIEMPRE antes de guardar, vengan de donde
 * vengan los datos (como `PeopleService.prepararDatos`):
 *
 *  1. El RUT queda limpio: sin puntos, con guion y la K en mayúscula.
 *  2. Un texto vacío queda en null (la casilla se borró).
 *  3. Los correos, en minúscula y separados por «, ».
 *  4. Las referencias, sin repetir y en el orden de la lista del SII.
 *
 * Solo devuelve los campos que venían: un PATCH del giro no borra el
 * resto.
 */
export const datosDeFacturacionLimpios = (
  datos: DatosDeFacturacion,
): DatosDeFacturacion => {
  const limpios: DatosDeFacturacion = {};

  if (datos.rut !== undefined) {
    const canonico = datos.rut ? normalizarRut(datos.rut) : null;
    if (datos.rut && !canonico) {
      throw new BadRequestException('Ese RUT no se puede leer');
    }
    limpios.rut = canonico;
  }

  for (const campo of TEXTOS) {
    if (datos[campo] !== undefined) limpios[campo] = textoLimpio(datos[campo]);
  }

  if (datos.correo_facturacion !== undefined) {
    const correos = correosDe(datos.correo_facturacion);
    limpios.correo_facturacion = correos.length ? correos.join(', ') : null;
  }

  if (datos.referencias_exigidas !== undefined) {
    const pedidas = new Set(datos.referencias_exigidas ?? []);
    limpios.referencias_exigidas = CODIGOS_DE_REFERENCIA.filter((c) =>
      pedidas.has(c),
    );
  }

  return limpios;
};
