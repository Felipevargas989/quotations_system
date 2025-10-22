import { baseLayoutTemplate } from '../baseLayout';
import { CustomerSatisfactionSurveyParams } from './types';

/**
 * Email template for customer satisfaction survey
 * Sent to client 3 days after their event to gather feedback
 * @param params - Survey details
 * @returns HTML string for the email
 */
export const customerSatisfactionSurveyTemplate = (
  params: CustomerSatisfactionSurveyParams,
): string => {
  // Build the email content
  const emailContent = `
    <style>
      .greeting {
        font-size: 18px;
        color: #374151;
        margin: 0 0 20px 0;
      }
      .intro-text {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0 0 20px 0;
      }
      .survey-info {
        font-size: 15px;
        color: #374151;
        line-height: 1.8;
        margin: 20px 0;
        padding: 20px;
        background-color: #f9fafb;
        border-left: 4px solid #3b82f6;
        border-radius: 4px;
      }
      .help-text {
        font-size: 14px;
        color: #6b7280;
        text-align: center;
        margin: 30px 0 10px 0;
        line-height: 1.6;
      }
      .highlight {
        font-weight: 600;
        color: #1f2937;
      }
    </style>

    <p class="greeting">Hola ${params.clientName},</p>

    <p class="intro-text">
      Te contactamos desde ${params.companyName} para agradecerte por haber confiado en nosotros para tu evento.
    </p>

    <p class="intro-text">
      Esperamos que hayas disfrutado de la experiencia y nos encantaría conocer tu opinión para seguir mejorando nuestros servicios.
    </p>

    <div class="survey-info">
      <strong>¿Por qué es importante tu opinión?</strong><br>
      Tu feedback nos ayuda a mejorar continuamente y garantizar la mejor experiencia para futuros eventos.
    </div>

    <p class="help-text">
      La encuesta solo te tomará unos minutos y es completamente anónima.
    </p>
  `;

  // Use the base layout with CTA button
  return baseLayoutTemplate({
    content: emailContent,
    cta: {
      text: 'Completar Encuesta de Satisfacción',
      link: `https://www.eventi-app.com/customer-satisfaction-survey?quotationId=${params.quotationId}&companyId=${params.companyId}`,
    },
  });
};
