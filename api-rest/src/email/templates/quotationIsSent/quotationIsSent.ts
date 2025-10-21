import { baseLayoutTemplate } from '../baseLayout';
import { QuotationIsSentParams } from './types';

/**
 * Email template for quotation is sent
 * Sent to client of quotation
 * @param params - Quotation is sent details
 * @returns HTML string for the email
 */
export const quotationIsSentTemplate = (
  params: QuotationIsSentParams,
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
      Te contactamos desde ${params.companyName} para informarte que la cotización para el evento que cotizaste con nosotros ya ha sido enviada.
      El número de cotización es <strong>#${params.quotationNumber}</strong>.
    </p>

    <p class="help-text">
      Si aún no la recibes, o necesitas ayuda, no dudes en contactar a ${params.companyName}.
    </p>
  `;

  // Use the base layout
  return baseLayoutTemplate({
    content: emailContent,
  });
};
