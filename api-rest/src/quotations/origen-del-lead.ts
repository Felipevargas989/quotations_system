/**
 * ORIGEN DEL LEAD (12-09-2026) — de dónde llegó quien llenó el formulario
 * público.
 *
 * La dirección con la que aterriza una persona trae migas: la huella de
 * clic que le pega la plataforma publicitaria (gclid de Google, fbclid de
 * Meta), las etiquetas utm_* si la campaña venía marcada, y de qué página
 * venía. Hoy todo eso se evapora al enviar el formulario.
 *
 * Este archivo hace dos cosas, y ninguna es adivinar:
 *   1. limpiarOrigen  — se queda SOLO con las llaves conocidas. El
 *      navegador no decide qué entra a la base de datos.
 *   2. etiquetaDeOrigen — traduce esas migas a una palabra que un humano
 *      entienda en la ficha: "Google Ads", "Meta", "WhatsApp", "Directo".
 *
 * GENÉRICO A PROPÓSITO: Eventia se vende a terceros. Nadie tiene que
 * configurar nada para que esto funcione — las huellas llegan solas y el
 * referente también. Las etiquetas utm_* son lo único opcional, y solo
 * para quien quiera distinguir campañas por nombre.
 */

/** Lo único que se guarda. Todo lo demás que venga en la dirección se
 *  descarta en silencio. */
const CLAVES = [
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'referrer',
] as const;

export type OrigenDetalle = Record<string, string>;

/** Tope por valor: una huella de Google ronda los 100 caracteres. 512 deja
 *  aire de sobra y corta cualquier intento de meter una novela. */
const LARGO_MAXIMO = 512;

/** Dominios propios: venir de la misma web no es un "referido". */
const CASA = ['eventi-app.com', 'localhost', '127.0.0.1'];

const BUSCADORES = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'ecosia.'];
const MEDIOS_PAGADOS = ['cpc', 'ppc', 'paid', 'ads', 'cpm', 'display'];

const titulo = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const hostDe = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Deja pasar solo las llaves conocidas, como texto, recortadas. Devuelve
 * null si no quedó nada — así la columna queda NULL y no un `{}` inútil.
 */
export const limpiarOrigen = (crudo: unknown): OrigenDetalle | null => {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const entrada = crudo as Record<string, unknown>;
  const limpio: OrigenDetalle = {};
  for (const clave of CLAVES) {
    const valor = entrada[clave];
    if (typeof valor !== 'string') continue;
    const recortado = valor.trim().slice(0, LARGO_MAXIMO);
    if (recortado) limpio[clave] = recortado;
  }
  return Object.keys(limpio).length ? limpio : null;
};

/**
 * La etiqueta legible. El orden importa: la huella de clic manda sobre
 * las utm_* (la pega la plataforma y no se equivoca), y las utm_* mandan
 * sobre el referente (las puso alguien a propósito).
 */
export const etiquetaDeOrigen = (detalle: OrigenDetalle | null): string => {
  if (!detalle) return 'Directo';

  if (detalle.gclid) return 'Google Ads';
  if (detalle.fbclid) return 'Meta';
  if (detalle.msclkid) return 'Microsoft Ads';
  if (detalle.ttclid) return 'TikTok Ads';

  const fuente = (detalle.utm_source ?? '').toLowerCase();
  const medio = (detalle.utm_medium ?? '').toLowerCase();
  const pagado = MEDIOS_PAGADOS.includes(medio);
  if (fuente) {
    if (fuente.includes('google')) return pagado ? 'Google Ads' : 'Google';
    if (/facebook|instagram|meta|^fb$|^ig$/.test(fuente))
      return pagado ? 'Meta Ads' : 'Meta';
    if (fuente.includes('whatsapp') || fuente === 'wa') return 'WhatsApp';
    if (fuente.includes('tiktok')) return pagado ? 'TikTok Ads' : 'TikTok';
    if (fuente.includes('linkedin')) return 'LinkedIn';
    if (medio === 'email' || fuente.includes('mail')) return 'Correo';
    return titulo(fuente);
  }

  const host = hostDe(detalle.referrer ?? '');
  if (!host) return 'Directo';
  if (CASA.some((propio) => host === propio || host.endsWith(`.${propio}`)))
    return 'Directo';
  if (BUSCADORES.some((b) => host.includes(b))) return 'Búsqueda orgánica';
  if (/facebook|instagram/.test(host)) return 'Meta';
  if (/whatsapp|wa\.me/.test(host)) return 'WhatsApp';
  if (/linkedin/.test(host)) return 'LinkedIn';
  if (/tiktok/.test(host)) return 'TikTok';
  if (/^(t\.co|twitter\.com|x\.com)$/.test(host)) return 'X';
  return `Referido: ${host}`;
};
