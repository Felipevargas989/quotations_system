import type { CredencialesDeFacturacionCl } from './soap';

/**
 * QUÉ CONEXIÓN USA ESTE MOTOR (doc 19 §5.3 y §9.18). Sale de las variables
 * que carga Felipe en Railway; Eventia nunca guarda el certificado (firma
 * facturacion.cl):
 * - `FACTURACIONCL_USUARIO`, `FACTURACIONCL_RUT` y `FACTURACIONCL_CLAVE`,
 *   las de «Administrador → Integración → Configuración → Credenciales»;
 * - `FACTURACIONCL_AMBIENTE`: «prueba» o «produccion»;
 * - `FACTURACIONCL_EMPRESA`: el N° de la empresa de Eventia dueña de esas
 *   credenciales (Valle del Sol es la 1). Ninguna otra emite con ellas.
 *
 * Los candados:
 * - el laboratorio usa SOLO las credenciales de prueba, y producción SOLO
 *   las de producción;
 * - producción nunca usa el simulado: sin credenciales, no emite y lo dice;
 * - sin credenciales, el laboratorio sigue con el simulado (pasos 1 a 4).
 *
 * Producción se reconoce por `NODE_ENV` (enciende los relojes, mapa 19) o
 * por su base. Si algún día el laboratorio pareciera producción, queda sin
 * emitir: el error va hacia el lado seguro.
 */

/** El proyecto de Supabase de producción ("Cotizador-dev" ES producción). */
const BASE_DE_PRODUCCION = 'yxezscjznhlnxxdmuvoq';

type AmbienteReal = 'prueba' | 'produccion';

export type ConfiguracionDeFacturacionCl =
  | { modo: 'simulado'; enProduccion: false }
  | {
      modo: 'conectado';
      enProduccion: boolean;
      empresa: number;
      ambiente: AmbienteReal;
      credenciales: CredencialesDeFacturacionCl;
    }
  | {
      modo: 'sin_conexion';
      enProduccion: boolean;
      /** null: ninguna empresa tiene conexión. */
      empresa: number | null;
      ambiente: AmbienteReal;
      motivo: string;
    };

const sinTildes = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function configuracionDeFacturacionCl(
  env: Record<string, string | undefined>,
): ConfiguracionDeFacturacionCl {
  const enProduccion =
    env.NODE_ENV === 'production' ||
    (env.SUPABASE_URL ?? '').includes(BASE_DE_PRODUCCION);
  const dato = (nombre: string) => env[`FACTURACIONCL_${nombre}`]?.trim() ?? '';
  const valores = {
    USUARIO: dato('USUARIO'),
    RUT: dato('RUT'),
    CLAVE: dato('CLAVE'),
    AMBIENTE: dato('AMBIENTE'),
    EMPRESA: dato('EMPRESA'),
  };
  const aquiVa: AmbienteReal = enProduccion ? 'produccion' : 'prueba';
  const sin = (motivo: string, empresa: number | null = null) => ({
    modo: 'sin_conexion' as const,
    enProduccion,
    empresa,
    ambiente: aquiVa,
    motivo,
  });

  if (!Object.values(valores).some(Boolean))
    return enProduccion
      ? sin(
          'facturacion.cl todavía no está conectado: faltan sus credenciales en Railway',
        )
      : { modo: 'simulado', enProduccion: false };

  const numero = Number(valores.EMPRESA);
  const empresa = Number.isInteger(numero) && numero > 0 ? numero : null;
  const faltan = Object.entries(valores)
    .filter(([, v]) => !v)
    .map(([nombre]) => `FACTURACIONCL_${nombre}`);
  if (faltan.length)
    return sin(`Faltan variables en Railway: ${faltan.join(', ')}`, empresa);
  if (!empresa)
    return sin('FACTURACIONCL_EMPRESA tiene que ser el N° de la empresa');

  const ambiente = sinTildes(valores.AMBIENTE.toLowerCase());
  const real: AmbienteReal | null = /^pruebas?$/.test(ambiente)
    ? 'prueba'
    : ambiente === 'produccion'
      ? 'produccion'
      : null;
  if (!real)
    return sin(
      `FACTURACIONCL_AMBIENTE dice «${valores.AMBIENTE}»: va «prueba» o «produccion»`,
      empresa,
    );
  if (enProduccion && real === 'prueba')
    return sin(
      'En producción van solo las credenciales de producción de facturacion.cl',
      empresa,
    );
  if (!enProduccion && real === 'produccion')
    return sin(
      'En el laboratorio van solo las credenciales de prueba de facturacion.cl',
      empresa,
    );
  return {
    modo: 'conectado',
    enProduccion,
    empresa,
    ambiente: real,
    credenciales: {
      usuario: valores.USUARIO,
      rut: valores.RUT,
      clave: valores.CLAVE,
    },
  };
}

/** Para el registro del motor: qué conexión quedó, sin ningún dato secreto. */
export const describirConfiguracion = (
  c: ConfiguracionDeFacturacionCl,
): string =>
  c.modo === 'simulado'
    ? 'simulado (sin credenciales)'
    : c.modo === 'conectado'
      ? `conectado en ${c.ambiente} para la empresa ${c.empresa}`
      : `sin conexión: ${c.motivo}`;
