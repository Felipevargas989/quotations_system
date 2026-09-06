import { createHmac, timingSafeEqual } from 'crypto';

/**
 * EL TOKEN DE IMPRESIÓN (doc 13): el pase de corta vida con el que el
 * navegador invisible del motor abre la hoja pública de UNA cotización
 * para imprimirla. HMAC con el mismo secreto de las bajas de
 * marketing; 15 minutos de vida; vencido o adulterado responde 404
 * sin pistas, igual que el portal del mandante.
 *
 * Funciones puras: reciben el reloj y el secreto, no tocan nada.
 */

export const VIDA_DEL_TOKEN_MS = 15 * 60_000;

const firma = (carga: string, secreto: string): string =>
  createHmac('sha256', secreto).update(carga).digest('base64url');

export const firmarTokenImpresion = (
  quotationId: string,
  secreto: string,
  ahoraMs: number,
): string => {
  const carga = Buffer.from(
    `${quotationId}|${String(ahoraMs + VIDA_DEL_TOKEN_MS)}`,
  ).toString('base64url');
  return `${carga}.${firma(carga, secreto)}`;
};

/** Devuelve el id de la cotización, o null si el token no vale. */
export const validarTokenImpresion = (
  token: string,
  secreto: string,
  ahoraMs: number,
): string | null => {
  const [carga, sello] = String(token || '').split('.');
  if (!carga || !sello) return null;
  const esperado = firma(carga, secreto);
  const a = Buffer.from(sello);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [id, exp] = Buffer.from(carga, 'base64url').toString().split('|');
  if (!id || !exp || Number(exp) < ahoraMs) return null;
  return id;
};
