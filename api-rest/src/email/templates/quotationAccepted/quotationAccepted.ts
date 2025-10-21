import { baseLayoutTemplate } from '../baseLayout';
import { QuotationAcceptedParams } from './types';

/**
 * Email template for quotation is accepted
 * Sent to client of quotation
 * @param params - Quotation accepted details
 * @returns HTML string for the email
 */
export const quotationAcceptedTemplate = (
  params: QuotationAcceptedParams,
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
        margin: 0 0 30px 0;
      }
      .help-text {
        font-size: 14px;
        color: #6b7280;
        text-align: center;
        margin: 30px 0 10px 0;
        line-height: 1.6;
      }
    </style>

    <p class="greeting">Hola ${params.clientName},</p>

    <p class="intro-text">
      Te contactamos desde ${params.companyName} para informarte que la cotización para tu evento ha sido aceptada.
      El número de cotización es <strong>#${params.quotationNumber}</strong>.
    </p>

    <p class="help-text">
      Si tienes alguna pregunta o necesitas ayuda, no dudes en contactar a ${params.companyName}.
    </p>
  `;

  // Use the base layout
  return baseLayoutTemplate({
    content: emailContent,
  });
};
