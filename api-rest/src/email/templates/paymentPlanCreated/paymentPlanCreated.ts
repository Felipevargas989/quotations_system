import { baseLayoutTemplate } from '../baseLayout';
import { formatCurrency, formatDate } from '../utils';
import { PaymentPlanCreatedParams } from './types';

/**
 * Email template for payment plan created
 * Sent to client when quotation is accepted and payment plan is created
 * @param params - Payment plan details
 * @returns HTML string for the email
 */
export const paymentPlanCreatedTemplate = (
  params: PaymentPlanCreatedParams,
): string => {
  // Format the payment details as plain text with line breaks
  const paymentsList = params.payments
    .map((payment) => {
      return `Pago #${payment.payment_number}: ${formatCurrency(payment.amount)} - Vence: ${formatDate(payment.due_date)}`;
    })
    .join('<br>');

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
      .payment-details {
        font-size: 15px;
        color: #374151;
        line-height: 1.8;
        margin: 20px 0;
        padding: 20px;
        background-color: #f9fafb;
        border-left: 4px solid #3b82f6;
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
      Te contactamos desde ${params.companyName} para informarte que tu cotización #${params.quotationNumber} ha sido aceptada.
    </p>

    <p class="intro-text">
      A continuación, encontrarás los detalles del plan de pagos acordado:
    </p>

    <div class="payment-details">${paymentsList}</div>

    <p class="help-text">
      Si tienes alguna pregunta o necesitas ayuda, no dudes en contactar a ${params.companyName}.
    </p>
  `;

  // Use the base layout
  return baseLayoutTemplate({
    content: emailContent,
  });
};
