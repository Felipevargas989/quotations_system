import { brandEmailTemplate, EmailBranding } from '../brandLayout';
import { CustomerSatisfactionSurveyParams } from './types';

/**
 * Invitación a la encuesta post-evento (rediseño 29-07, copy aprobado
 * por Felipe): agradece la confianza y pide 2 minutos.
 */
export const customerSatisfactionSurveyTemplate = (
  params: CustomerSatisfactionSurveyParams,
  branding: EmailBranding,
): string => {
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">¡Gracias por celebrar con ${params.companyName}!</p>
    <p style="margin:0 0 14px;">Hola ${params.clientName}, esperamos que tu evento haya sido todo lo que imaginabas.</p>
    <p style="margin:0 0 14px;">¿Nos regalas 2 minutos? Tu opinión define cómo hacemos los próximos eventos — la leemos de verdad.</p>`;

  return brandEmailTemplate({
    branding,
    bodyHtml,
    cta: {
      text: 'Responder la encuesta (2 min)',
      link: `https://www.eventi-app.com/customer-satisfaction-survey/${params.companyId}/${params.quotationId}`,
    },
  });
};
