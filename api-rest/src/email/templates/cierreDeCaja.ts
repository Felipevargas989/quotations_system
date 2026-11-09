import { correoInternoTemplate } from './brandLayout';

/**
 * EL RESUMEN DEL CIERRE DE LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 3).
 * Le llega a quien revisa los cierres (permiso «Revisar cierres de caja»)
 * apenas se cierra la caja, como el resumen de Fudo. Quien cerró no lo
 * recibe: el cierre es ciego.
 */
export type CierreDeCajaParams = {
  companyName?: string | null;
  /** Quién cerró la caja. */
  quien: string;
  /** ISO. */
  abierta: string;
  /** ISO. */
  cerrada: string;
  lineas: {
    medio: string;
    declarado: number;
    esperado: number;
    diferencia: number;
  }[];
  vendido: number;
  retiros: number;
  diferencia: number;
  comentario?: string | null;
};

const NOMBRE: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
};

const pesos = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;

const escapar = (t: string) =>
  t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** «cuadra», «faltan $5.000» o «sobran $500». */
const resultado = (d: number) =>
  d === 0 ? 'cuadra' : d < 0 ? `faltan ${pesos(-d)}` : `sobran ${pesos(d)}`;

const fechaYHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  });

export const asuntoDelCierre = (p: CierreDeCajaParams) =>
  `Cierre de caja · ${p.quien} · ${resultado(p.diferencia)}`;

export const cierreDeCajaTemplate = (p: CierreDeCajaParams): string => {
  const color = (d: number) =>
    d === 0 ? '#15803d' : d < 0 ? '#b91c1c' : '#b45309';
  const filas = p.lineas
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;">${NOMBRE[l.medio] ?? escapar(l.medio)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;text-align:right;">${pesos(l.declarado)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;text-align:right;">${pesos(l.esperado)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e5e7eb;text-align:right;color:${color(l.diferencia)};">${resultado(l.diferencia)}</td>
      </tr>`,
    )
    .join('');
  const bodyHtml = `
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px;">
      <strong>${escapar(p.quien)}</strong> cerró la caja de recepción
      (${fechaYHora(p.abierta)} a ${fechaYHora(p.cerrada)}).
      Resultado: <strong style="color:${color(p.diferencia)};">${resultado(p.diferencia)}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;margin:0 0 14px;">
      <tr style="color:#6b7280;font-size:12px;">
        <th style="padding:4px 8px;text-align:left;font-weight:500;">Medio</th>
        <th style="padding:4px 8px;text-align:right;font-weight:500;">Declaró</th>
        <th style="padding:4px 8px;text-align:right;font-weight:500;">Según Eventia</th>
        <th style="padding:4px 8px;text-align:right;font-weight:500;">Diferencia</th>
      </tr>${filas}
    </table>
    <p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0 0 6px;">
      Vendido en el turno: ${pesos(p.vendido)} · Retiros: ${pesos(p.retiros)}
    </p>
    <p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0;">
      Comentario: ${p.comentario ? escapar(p.comentario) : 'sin comentario'}
    </p>`;
  return correoInternoTemplate({
    branding: p.companyName ? { companyName: p.companyName } : null,
    titulo: 'Cierre de la caja de recepción',
    bodyHtml,
    cta: {
      text: 'Revisar el cierre',
      link: 'https://www.eventi-app.com/facturacion',
    },
  });
};
