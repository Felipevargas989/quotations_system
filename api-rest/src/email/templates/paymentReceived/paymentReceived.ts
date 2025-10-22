import { baseLayoutTemplate } from '../baseLayout';
import { formatCurrency, formatDate } from '../utils';
import { PaymentReceivedParams } from './types';

/**
 * Email template for payment received confirmation
 * Sent to client when a new payment transaction is created
 * @param params - Payment transaction details
 * @returns HTML string for the email
 */
export const paymentReceivedTemplate = (
  params: PaymentReceivedParams,
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
      .payment-details {
        font-size: 15px;
        color: #374151;
        line-height: 1.8;
        margin: 20px 0;
        padding: 20px;
        background-color: #f9fafb;
        border-left: 4px solid #10b981;
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
      Te contactamos desde ${params.companyName} para confirmar que hemos recibido tu pago correctamente.
    </p>

    <p class="intro-text">
      A continuación, encontrarás los detalles de la transacción:
    </p>

    <div class="payment-details">
      Monto: ${formatCurrency(params.amount)}<br>
      Método de pago: ${params.paymentMethod}<br>
      Fecha de pago: ${formatDate(params.transactionDate)}
    </div>

    <p class="help-text">
      Si tienes alguna pregunta o necesitas ayuda, no dudes en contactar a ${params.companyName}.
    </p>
  `;

  // Use the base layout
  return baseLayoutTemplate({
    content: emailContent,
  });
};
