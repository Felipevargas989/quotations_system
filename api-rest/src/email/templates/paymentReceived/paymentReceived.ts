import {
  brandEmailTemplate,
  cifraBox,
  EmailBranding,
  fmtCLP,
} from '../brandLayout';
import { formatDate } from '../utils';
import { PaymentReceivedParams } from './types';

/**
 * Comprobante de pago recibido (rediseño 29-07, copy aprobado por
 * Felipe). Cinta azul informativa y el monto en caja grande.
 */
export const paymentReceivedTemplate = (
  params: PaymentReceivedParams,
  branding: EmailBranding,
): string => {
  const primary = branding.primary || '#134686';

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">Hola ${params.clientName},</p>
    <p style="margin:0 0 14px;">Confirmamos que recibimos tu pago.</p>
    ${cifraBox(
      'Pago recibido',
      fmtCLP(params.amount),
      `${params.paymentMethod} · ${formatDate(params.transactionDate)}`,
      primary,
    )}
    <p style="margin:0 0 14px;">Gracias por tu confianza.</p>`;

  return brandEmailTemplate({
    branding,
    band: { text: 'Comprobante de pago', tone: 'info' },
    bodyHtml,
  });
};
