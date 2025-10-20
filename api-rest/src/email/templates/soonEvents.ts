import { Quotation } from 'src/quotations/entities/quotation.entity';
import { baseLayoutTemplate } from './baseLayout';

/**
 * Email template for events happening in exactly 3 days
 * @param events - Array of quotation events (all happening in 3 days)
 * @returns HTML string for the email
 */
export const soonEventsTemplate = (
  events: Pick<Quotation, 'id' | 'event_date' | 'event_type'>[],
): string => {
  // Helper function to format date
  const formatDate = (date: Date | string): string => {
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get the target date (3 days from now)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 3);

  // Build the email content
  const emailContent = `
    <style>
      .alert-banner {
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-left: 4px solid #f59e0b;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 30px;
        text-align: center;
      }
      .alert-icon {
        font-size: 48px;
        margin-bottom: 10px;
      }
      .alert-text {
        font-size: 18px;
        font-weight: 600;
        color: #92400e;
        margin: 0;
      }
      .title {
        font-size: 24px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 10px 0;
        text-align: center;
      }
      .subtitle {
        font-size: 16px;
        color: #6b7280;
        margin: 0 0 30px 0;
        text-align: center;
      }
      .date-highlight {
        background-color: #dbeafe;
        border-radius: 8px;
        padding: 15px;
        margin: 20px 0;
        text-align: center;
      }
      .date-highlight strong {
        color: #1e40af;
        font-size: 18px;
      }
      .event-card {
        background-color: #f9fafb;
        border-left: 4px solid #134686;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 15px;
      }
      .event-card:last-child {
        margin-bottom: 0;
      }
      .event-type {
        font-size: 18px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 12px 0;
      }
      .event-detail {
        font-size: 14px;
        color: #4b5563;
        margin: 8px 0;
      }
      .event-detail strong {
        color: #374151;
      }
      .events-count {
        background-color: #134686;
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
        display: inline-block;
        margin-bottom: 20px;
      }
      .reminder-box {
        background-color: #f0fdf4;
        border-left: 4px solid #10b981;
        padding: 15px 20px;
        border-radius: 8px;
        margin-top: 30px;
      }
      .reminder-box p {
        margin: 0;
        color: #065f46;
        font-size: 14px;
        line-height: 1.6;
      }
    </style>

    <div class="alert-banner">
      <div class="alert-icon">⏰</div>
      <p class="alert-text">¡Recordatorio! Eventos en 3 días</p>
    </div>

    <h2 class="title">📅 Eventos Programados</h2>
    <p class="subtitle">
      ${events.length === 1 ? 'Tienes 1 evento programado' : `Tienes ${events.length} eventos programados`} para el <strong>${formatDate(targetDate)}</strong>
    </p>

    <div class="date-highlight">
      <strong>📆 ${formatDate(targetDate)}</strong>
    </div>

    <div style="text-align: center; margin-bottom: 20px;">
      <span class="events-count">${events.length} ${events.length === 1 ? 'evento' : 'eventos'}</span>
    </div>

    ${events
      .map((event) => {
        return `
      <div class="event-card">
        <h3 class="event-type">${event.event_type || 'Evento'}</h3>
        <p class="event-detail">
          <strong>📍 Fecha:</strong> ${formatDate(event.event_date)}
        </p>
        <p class="event-detail">
          <strong>🆔 ID:</strong> ${event.id}
        </p>
      </div>
    `;
      })
      .join('')}

    <div class="reminder-box">
      <p>
        ✅ <strong>Recuerda:</strong> Estos eventos se realizarán en 3 días.
        Asegúrate de tener todo preparado y confirmar los detalles finales con tus clientes.
      </p>
    </div>
  `;

  // Use the base layout
  return baseLayoutTemplate({
    content: emailContent,
    cta: {
      text: 'Ver Todos los Eventos',
      link: 'https://www.eventi-app.com/calendar',
    },
  });
};
