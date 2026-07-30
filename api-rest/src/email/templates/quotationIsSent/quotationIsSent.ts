import { brandEmailTemplate, EmailBranding } from '../brandLayout';
import { QuotationIsSentParams } from './types';

/**
 * Aviso de cotización enviada (rediseño 29-07, copy aprobado por
 * Felipe): invita a conversar ajustes sin presionar.
 */
export const quotationIsSentTemplate = (
  params: QuotationIsSentParams,
  branding: EmailBranding,
): string => {
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">Hola ${params.clientName},</p>
    <p style="margin:0 0 14px;">Preparamos tu cotización <b>N° ${params.quotationNumber}</b> y ya va en camino (revisa también el correo con el documento adjunto).</p>
    <p style="margin:0 0 14px;">¿Quieres ajustar algo — cantidad de personas, menú, servicios? Conversemos: esta cotización es un punto de partida, no una camisa de fuerza. Responde este correo y lo vemos.</p>`;

  return brandEmailTemplate({
    branding,
    bodyHtml,
  });
};
