import { baseLayoutTemplate } from '../baseLayout';

/**
 * Email template for new public quotation submission
 * Sent to the client who submitted the quotation via public form
 * @returns HTML string for the email
 */
export const newPublicQuotationClientTemplate = (): string => {
  const content = `
    <style>
      .success-icon {
        text-align: center;
        font-size: 64px;
        margin: 20px 0;
      }
      .title {
        font-size: 24px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 20px 0;
        text-align: center;
      }
      .message {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0 0 20px 0;
        text-align: center;
      }
      .info-box {
        background-color: #dbeafe;
        border-left: 4px solid #134686;
        padding: 20px;
        border-radius: 8px;
        margin: 30px 0;
      }
      .info-box h3 {
        margin: 0 0 10px 0;
        color: #1e3a8a;
        font-size: 18px;
      }
      .info-box p {
        margin: 0;
        color: #1e40af;
        line-height: 1.6;
      }
      .next-steps {
        background-color: #f9fafb;
        padding: 20px;
        border-radius: 8px;
        margin: 20px 0;
      }
      .next-steps h3 {
        margin: 0 0 15px 0;
        color: #374151;
        font-size: 18px;
      }
      .next-steps ul {
        margin: 0;
        padding-left: 20px;
        color: #6b7280;
      }
      .next-steps li {
        margin-bottom: 8px;
        line-height: 1.5;
      }
      .next-steps li:last-child {
        margin-bottom: 0;
      }
    </style>

    <div class="success-icon">✅</div>

    <h2 class="title">¡Solicitud de Cotización Recibida!</h2>

    <p class="message">
      Hola, tu solicitud de cotización ha sido creada exitosamente. Nuestro equipo la está revisando y te contactaremos pronto.
    </p>

    <div class="info-box">
      <h3>📋 ¿Qué sigue ahora?</h3>
      <p>
        Nuestro equipo revisará tu solicitud y se pondrá en contacto contigo en las próximas 24-48 horas para brindarte una cotización detallada y personalizada.
      </p>
    </div>

    <div class="next-steps">
      <h3>Próximos pasos:</h3>
      <ul>
        <li>Revisaremos todos los detalles de tu evento</li>
        <li>Te enviaremos una cotización personalizada</li>
        <li>Coordinaremos una reunión si es necesario</li>
        <li>Responderemos todas tus dudas y consultas</li>
      </ul>
    </div>

    <p class="message" style="font-size: 14px; color: #6b7280;">
      Si tienes alguna pregunta urgente, no dudes en contactarnos directamente.
    </p>
  `;

  return baseLayoutTemplate({
    content,
    cta: {
      text: 'Ver Estado de Solicitud',
      link: 'https://www.eventi-app.com/quotations',
    },
  });
};
