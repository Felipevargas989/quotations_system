import {
  brandEmailTemplate,
  cifraBox,
  datosCobroPanel,
  EmailBranding,
  fmtCLP,
  fmtFechaLarga,
} from '../brandLayout';
import { PaymentReminderParams } from './types';

/**
 * Recordatorio de pago AL CLIENTE (rediseño 29-07, copy aprobado por
 * Felipe). El mismo template cubre los dos toques previos al
 * vencimiento y decide por la fecha: vence en días (toque 1, cinta
 * azul) o vence HOY (toque 2, cinta ámbar).
 */
export const daysToDue = (due: Date | string): number => {
  const hoy = new Date().toISOString().slice(0, 10);
  const dueStr =
    typeof due === 'string' ? due.slice(0, 10) : due.toISOString().slice(0, 10);
  return Math.round(
    (new Date(`${dueStr}T12:00:00Z`).getTime() -
      new Date(`${hoy}T12:00:00Z`).getTime()) /
      86400000,
  );
};

export const paymentReminderTemplate = (
  params: PaymentReminderParams,
  branding: EmailBranding,
): string => {
  const dias = daysToDue(params.payment.due_date);
  const venceHoy = dias <= 0;
  const fecha = fmtFechaLarga(params.payment.due_date);
  const primary = branding.primary || '#134686';

  const intro = venceHoy
    ? `La cuota de tu evento vence <b>hoy, ${fecha}</b>.`
    : `Un recordatorio amistoso: la cuota de tu evento vence el <b>${fecha}</b>.`;
  const cierre = venceHoy
    ? `<p style="margin:0 0 14px;">¿Algún inconveniente con la fecha? Responde este correo y lo conversamos — estamos para ayudarte.</p>`
    : `<p style="margin:0 0 14px;font-size:13.5px;color:#6b7280;">Si ya pagaste, ignora este correo — el comprobante puede tardar un poco en registrarse.</p>`;

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">Hola ${params.clientName},</p>
    <p style="margin:0 0 14px;">${intro}</p>
    ${cifraBox(
      `Cuota ${params.payment.payment_number} · cotización N° ${params.quotationId}`,
      fmtCLP(params.payment.amount),
      venceHoy ? 'Vence hoy' : `Vence el ${fecha}`,
      primary,
    )}
    ${datosCobroPanel(branding.bank)}
    ${cierre}`;

  return brandEmailTemplate({
    branding,
    band: venceHoy
      ? { text: 'Tu cuota vence hoy', tone: 'aviso' }
      : { text: 'Recordatorio de pago', tone: 'info' },
    bodyHtml,
  });
};
