import { correoInternoTemplate, EmailBranding } from '../brandLayout';
import { PaymentReminderParams } from '../paymentReminder/types';
import { formatCurrency, formatDate } from '../utils';

/**
 * Aviso INTERNO al administrador: una cuota se venció sin pagar. Con
 * la cabecera de marca de la casa desde el 02-09.
 */
export const paymentOverdueAdminTemplate = (
  params: PaymentReminderParams,
  branding?: EmailBranding,
): string => {
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hay una cuota <b>vencida sin pagar</b> en
    la cotización <b>N° ${params.quotationId}</b>. Al cliente ya le
    mandamos el aviso automático.</p>
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
        <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">Venció</td>
        <td style="padding:6px 12px;color:#b91c1c;font-size:14px;font-weight:700;">${formatDate(params.payment.due_date)}</td>
      </tr>
    </table>`;
  return correoInternoTemplate({
    branding,
    titulo: 'Pago vencido',
    bodyHtml,
  });
};
