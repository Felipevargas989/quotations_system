import { Quotation } from 'src/quotations/entities/quotation.entity';
import { baseLayoutTemplate } from './baseLayout';

/**
 * Email template for upcoming events notification
 * @param events - Array of quotation events
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

  // Helper function to calculate days until event
  const getDaysUntil = (date: Date | string): number => {
    const eventDate = new Date(date);
    const today = new Date();
    const diffTime = eventDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Helper function to get countdown text
  const getCountdownText = (daysUntil: number): string => {
    if (daysUntil === 0) {
      return '⚠️ ¡HOY!';
    }
    if (daysUntil === 1) {
      return '⚠️ Mañana';
    }
    if (daysUntil < 0) {
      const absDays = Math.abs(daysUntil);
      return `Hace ${absDays} día${absDays > 1 ? 's' : ''}`;
    }
    return `En ${daysUntil} día${daysUntil > 1 ? 's' : ''}`;
  };

  // Helper function to get subtitle text
  const getSubtitleText = (eventCount: number): string => {
    if (eventCount === 0) {
      return 'No tienes eventos próximos en este momento.';
    }
    const eventWord = eventCount > 1 ? 'eventos' : 'evento';
    const proximoWord = eventCount > 1 ? 'próximos' : 'próximo';
    return `Tienes ${eventCount} ${eventWord} ${proximoWord}.`;
  };

  // Build the email content
  const emailContent = `
    <style>
      .title {
        font-size: 24px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 10px 0;
      }
      .subtitle {
        font-size: 16px;
        color: #6b7280;
        margin: 0 0 30px 0;
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
        margin: 0 0 8px 0;
      }
      .event-date {
        font-size: 14px;
        color: #4b5563;
        margin: 0 0 5px 0;
      }
      .event-countdown {
        font-size: 13px;
        color: #134686;
        font-weight: 600;
        margin: 5px 0 0 0;
      }
      .urgent {
        border-left-color: #dc2626;
      }
      .urgent .event-countdown {
        color: #dc2626;
      }
      .no-events {
        text-align: center;
        padding: 40px 20px;
        color: #6b7280;
      }
    </style>

    <h2 class="title">📅 Eventos Próximos</h2>
    <p class="subtitle">
      ${getSubtitleText(events.length)}
    </p>

    ${
      events.length > 0
        ? events
            .map((event) => {
              const daysUntil = getDaysUntil(event.event_date);
              const isUrgent = daysUntil <= 3;

              return `
            <div class="event-card ${isUrgent ? 'urgent' : ''}">
              <h3 class="event-type">${event.event_type || 'Evento'}</h3>
              <p class="event-date">📍 ${formatDate(event.event_date)}</p>
              <p class="event-countdown">
                ${getCountdownText(daysUntil)}
              </p>
            </div>
          `;
            })
            .join('')
        : '<div class="no-events">✨ No hay eventos programados próximamente</div>'
    }
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
