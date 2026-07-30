import { Company } from 'src/companies/entities/company.entity';

/**
 * Plantilla de marca para correos AL CLIENTE (rediseño 29-07-2026,
 * galería aprobada por Felipe). Cabecera con el color primario de LA
 * EMPRESA (no de Eventia), logo a la derecha, subtítulo editable,
 * cinta de tono opcional y pie sobrio. Todo con estilos EN LÍNEA:
 * Gmail y Outlook no respetan otra cosa.
 *
 * Los correos internos del equipo siguen usando baseLayout; esta
 * plantilla es la cara pública de cada empresa.
 */

export interface EmailBranding {
  companyName: string;
  tagline?: string | null;
  logoUrl?: string | null;
  /** Color primario de la empresa; si falta, azul Eventia. */
  primary?: string;
  bank?: Company['bank_details'];
}

export type BandTone = 'info' | 'aviso' | 'firme';

const EVENTIA_BLUE = '#134686';

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const fmtCLP = (n: number): string =>
  '$' + Number(n || 0).toLocaleString('es-CL');

export const fmtFechaLarga = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(`${d}T12:00:00`) : d;
  return date.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

/** Caja del monto grande (lo primero que busca el cliente). */
export const cifraBox = (
  label: string,
  valor: string,
  sub: string,
  primary: string,
): string => `
  <div style="background:#f4f7fb;border:1px solid #dfe8f3;border-radius:10px;padding:16px 20px;margin:18px 0;">
    <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.07em;font-weight:700;">${label}</div>
    <div style="font-size:26px;font-weight:800;color:${primary};">${valor}</div>
    <div style="font-size:13.5px;color:#4b5563;margin-top:4px;">${sub}</div>
  </div>`;

/** Panel punteado con los datos de cobro de la empresa. */
export const datosCobroPanel = (bank?: Company['bank_details']): string => {
  if (!bank || (!bank.numero && !bank.banco)) return '';
  const lineas = [
    [bank.titular, bank.rut ? `RUT ${bank.rut}` : '']
      .filter(Boolean)
      .join(' · '),
    [bank.banco, bank.tipo_cuenta, bank.numero].filter(Boolean).join(' · '),
    bank.correo_pagos || '',
  ]
    .filter(Boolean)
    .join('<br>');
  return `
  <div style="background:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:14px;color:#374151;">
    <b style="color:#111827;">Datos para transferir</b><br>${lineas}
  </div>`;
};

const bandHtml = (text: string, tone: BandTone, primary: string): string => {
  const styles: Record<BandTone, string> = {
    info: `background:#e8eef7;color:${primary};`,
    aviso: 'background:#fef3c7;color:#92600a;',
    firme: 'background:#b45309;color:#ffffff;',
  };
  return `<div style="padding:9px 32px;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;${styles[tone]}">${text}</div>`;
};

export interface BrandEmailParams {
  branding: EmailBranding;
  /** Cinta bajo la cabecera (escala el tono de la cobranza). */
  band?: { text: string; tone: BandTone };
  /** HTML del cuerpo (párrafos, cifraBox, datosCobroPanel...). */
  bodyHtml: string;
  cta?: { text: string; link: string; tone?: 'primario' | 'firme' };
  /** Línea extra del pie (bajo el nombre de la empresa). */
  footerNote?: string;
}

export const brandEmailTemplate = (p: BrandEmailParams): string => {
  const primary = p.branding.primary || EVENTIA_BLUE;
  // Cabecera BLANCA (decisión de Felipe 29-07): franja fina del color
  // primario arriba, nombre en el primario, subtítulo gris y el logo
  // sin caja — así se adapta a cualquier logo de cualquier empresa.
  const logo = p.branding.logoUrl
    ? `<td align="right" style="vertical-align:middle;"><img src="${p.branding.logoUrl}" alt="" height="48" style="max-height:48px;max-width:130px;"></td>`
    : '';
  const tagline = p.branding.tagline
    ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">${p.branding.tagline}</div>`
    : '';
  const ctaColor = p.cta?.tone === 'firme' ? '#b45309' : primary;
  const cta = p.cta
    ? `<div style="text-align:center;padding:8px 32px 28px;">
        <a href="${p.cta.link}" style="display:inline-block;background:${ctaColor};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 34px;border-radius:10px;">${p.cta.text}</a>
      </div>`
    : '<div style="height:20px;"></div>';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${p.branding.companyName}</title></head>
<body style="margin:0;padding:0;background:#eceff2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceff2;padding:24px 8px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${FONT};color:#1f2937;font-size:15px;line-height:1.6;">
      <tr><td style="background:${primary};height:6px;font-size:2px;line-height:6px;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;padding:22px 32px 18px;border-bottom:1px solid #eef1f4;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <div style="color:${primary};font-size:21px;font-weight:800;font-family:${FONT};">${p.branding.companyName}</div>
            ${tagline}
          </td>
          ${logo}
        </tr></table>
      </td></tr>
      ${p.band ? `<tr><td>${bandHtml(p.band.text, p.band.tone, primary)}</td></tr>` : ''}
      <tr><td style="padding:28px 32px 8px;">${p.bodyHtml}</td></tr>
      <tr><td>${cta}</td></tr>
      <tr><td style="border-top:1px solid #e5e7eb;padding:18px 32px 22px;font-size:12.5px;color:#9ca3af;">
        <b style="color:#6b7280;">${p.branding.companyName}</b>${p.footerNote ? `<br>${p.footerNote}` : ''}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
};
