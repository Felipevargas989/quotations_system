import {
  brandEmailTemplate,
  EmailBranding,
  fmtFechaLarga,
} from '../brandLayout';
import { QuotationFollowUpParams } from './types';

/**
 * SEGUIMIENTO COMERCIAL (diseño de Felipe 30-07): dos toques amables
 * para cotizaciones enviadas sin respuesta — día 7 y día 14. Puro
 * positivo: nunca se invita al no (corrección de Felipe al copy).
 * Después del toque 2, silencio.
 */
export const quotationFollowUpTemplate = (
  params: QuotationFollowUpParams,
  branding: EmailBranding,
): string => {
  const evento = params.eventType
    ? `tu ${params.eventType}${params.eventDate ? ` del ${fmtFechaLarga(params.eventDate)}` : ''}`
    : 'tu evento';

  const cuerpo =
    params.toque === 1
      ? `<p style="margin:0 0 14px;">Hace una semana te enviamos la cotización <b>N° ${params.quotationNumber}</b> para ${evento}. ¿Tuviste oportunidad de revisarla?</p>
    <p style="margin:0 0 14px;">Cualquier duda o ajuste — personas, menú, servicios — responde este correo y lo conversamos.</p>`
      : `<p style="margin:0 0 14px;">Seguimos disponibles para conversar la cotización <b>N° ${params.quotationNumber}</b> de ${evento}.</p>
    <p style="margin:0 0 14px;">La cotización es flexible: si algo no calza — fechas, presupuesto, cantidad de personas — la ajustamos contigo. Responde este correo y lo vemos.</p>`;

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">Hola ${params.clientName},</p>
    ${cuerpo}`;

  return brandEmailTemplate({
    branding,
    bodyHtml,
  });
};
