import type { MarcaEmpresa } from './plantilla';

/**
 * LA MARCA DE LA EMPRESA desde su fila de companies — el mapeo que
 * usaba solo el controller, compartido desde el 04-09 para que el
 * RELOJ de las campañas programadas arme LA MISMA marca al despachar
 * (capítulo "Programar envío" del doc 11).
 */

/** La fila de companies, en lo que a la marca le importa. */
export interface FilaDeMarca {
  name?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  tagline?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  sitio_web?: string | null;
  colors?: { primary?: string | null; secondary?: string | null } | null;
  notifications?: { replyTo?: string | null } | null;
}

export const marcaDesdeFila = (data: FilaDeMarca): MarcaEmpresa => ({
  nombre: data.name ?? 'Eventia',
  logo: data.logo_url?.trim() || null,
  banner: data.banner_url?.trim() || null,
  tagline: data.tagline?.trim() || null,
  whatsapp: data.whatsapp?.trim() || null,
  instagram: data.instagram?.trim() || null,
  facebook: data.facebook?.trim() || null,
  sitioWeb: data.sitio_web?.trim() || null,
  colorPrimario: data.colors?.primary?.trim() || '#134686',
  colorSecundario: data.colors?.secondary?.trim() || '#f9fafb',
  replyTo: data.notifications?.replyTo?.trim() || null,
});
