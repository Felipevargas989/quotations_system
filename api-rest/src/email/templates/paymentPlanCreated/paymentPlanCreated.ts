import {
  brandEmailTemplate,
  EmailBranding,
  fmtCLP,
  fmtFechaLarga,
} from '../brandLayout';
import { PaymentPlanCreatedParams } from './types';

/**
 * Cotización aceptada + plan de pagos (rediseño 29-07). Muestra las
 * cuotas en filas limpias con la fecha y el monto de cada una.
 */
export const paymentPlanCreatedTemplate = (
  params: PaymentPlanCreatedParams,
  branding: EmailBranding,
): string => {
  const primary = branding.primary || '#134686';

  const filas = params.payments
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14.5px;color:#1f2937;">Cuota ${p.payment_number}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14.5px;color:#6b7280;">vence ${fmtFechaLarga(p.due_date)}</td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14.5px;font-weight:700;color:${primary};">${fmtCLP(p.amount)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">Hola ${params.clientName},</p>
    <p style="margin:0 0 14px;">¡Tu cotización <b>N° ${params.quotationNumber}</b> quedó aceptada! Gracias por confiar en nosotros para tu evento.</p>
    <p style="margin:0 0 8px;">Este es el plan de pagos que acordamos:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">${filas}</table>
    <p style="margin:0 0 14px;">Antes de cada vencimiento te enviaremos un recordatorio con los datos para transferir. ¿Dudas? Responde este correo.</p>`;

  return brandEmailTemplate({
    branding,
    band: { text: 'Cotización aceptada', tone: 'info' },
    bodyHtml,
  });
};
