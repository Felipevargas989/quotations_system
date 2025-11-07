import { baseLayoutTemplate } from '../baseLayout';
import { PaymentReminderParams } from '../paymentReminder/types';
import { formatCurrency, formatDate } from '../utils';

/**
 * Email template for payment overdue
 * Sent to clients with a overdue payment
 * @param params - Payment overdue details
 * @returns HTML string for the email
 */
export const paymentOverdueAdminTemplate = (
  params: PaymentReminderParams,
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

    <p class="greeting">Hola,</p>

    <p class="intro-text">
      Hay un pago vencido de la cotización <strong>#${params.quotationId}</strong> para la empresa ${params.companyName}.
    </p>

    <p>
      Le enviamos un recordatorio automático de pago al cliente recordandole que el pago se vence el día ${formatDate(params.payment.due_date)}.
    </p>

    <div class="intro-text">
      A continuación te indicamos los detalles del pago vencido:
    </div>

    <div class="intro-text">
      <p><strong>Número de Pago:</strong>${params.payment.payment_number}</p>
      <p><strong>Monto a Pagar:</strong> ${formatCurrency(params.payment.amount)}</p>
      <p><strong>Fecha de Vencimiento:</strong> ${formatDate(params.payment.due_date)}</p>
    </div>
  `;

  // Use the base layout
  return baseLayoutTemplate({
    content: emailContent,
  });
};
