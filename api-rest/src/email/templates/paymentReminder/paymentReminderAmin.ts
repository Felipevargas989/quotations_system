import { correoInternoTemplate, EmailBranding } from '../brandLayout';
import { formatCurrency, formatDate } from '../utils';
import { PaymentReminderParams } from './types';

/**
 * Aviso INTERNO al administrador: una cuota está por vencer y al
 * cliente ya se le mandó su recordatorio. Con la cabecera de marca de
 * la casa desde el 02-09 (antes: plantilla genérica que Outlook
 * mostraba con un bloque blanco).
 */
export const paymentReminderAdminTemplate = (
  params: PaymentReminderParams,
  branding?: EmailBranding,
): string => {
  const bodyHtml = `
    <p style="margin:0 0 12px;">Pronto vence una cuota de la cotización
    <b>N° ${params.quotationId}</b>. Al cliente ya le mandamos su
    recordatorio automático.</p>
    <table cellpadding="0" cellspacing="0" style="margin:4px 0 12px;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;width:100%;">
      <tr>
        <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">Cuota</td>
        <td style="padding:6px 12px;color:#111827;font-size:14px;font-weight:600;">N° ${params.payment.payment_number}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">Monto</td>
        <td style="padding:6px 12px;color:#111827;font-size:14px;font-weight:600;">${formatCurrency(params.payment.amount)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">Vence</td>
        <td style="padding:6px 12px;color:#111827;font-size:14px;font-weight:600;">${formatDate(params.payment.due_date)}</td>
      </tr>
    </table>`;
  return correoInternoTemplate({
    branding,
    titulo: 'Pago por vencer',
    bodyHtml,
  });
};
