import {
  brandEmailTemplate,
  cifraBox,
  datosCobroPanel,
  EmailBranding,
  fmtCLP,
  fmtFechaLarga,
} from '../brandLayout';
import { PaymentReminderParams } from '../paymentReminder/types';

/**
 * Cobranza de cuota VENCIDA al cliente (rediseño 29-07, copy aprobado
 * por Felipe). Último toque automático: firme y respetuoso, con la
 * puerta abierta a conversar. Cinta ámbar firme.
 */
export const paymentOverdueTemplate = (
  params: PaymentReminderParams,
  branding: EmailBranding,
): string => {
  const fecha = fmtFechaLarga(params.payment.due_date);
  const primary = branding.primary || '#134686';

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">Hola ${params.clientName},</p>
    <p style="margin:0 0 14px;">La cuota de tu evento venció el <b>${fecha}</b> y aún no registramos el pago.</p>
    ${cifraBox(
      `Cuota ${params.payment.payment_number} · cotización N° ${params.quotationId}`,
      fmtCLP(params.payment.amount),
      `<span style="color:#b45309;font-weight:700;">Vencida el ${fecha}</span>`,
      primary,
    )}
    ${datosCobroPanel(branding.bank)}
    <p style="margin:0 0 14px;">Para asegurar que tu evento siga en pie tal como lo planificamos, necesitamos regularizar este pago.</p>
    <p style="margin:0 0 14px;">Si hay un problema o quieres proponer una nueva fecha, <b>responde este correo hoy</b> — siempre hay una solución conversando.</p>`;

  return brandEmailTemplate({
    branding,
    band: { text: 'Pago pendiente — requiere tu atención', tone: 'firme' },
    bodyHtml,
  });
};
