import { Quotation } from 'src/quotations/entities/quotation.entity';

/**
 * Email template for upcoming events notification
 * @param events - Array of quotation events
 * @returns HTML string for the email
 */
export const soonEventsTemplate = (
  events: Pick<Quotation, 'id' | 'event_date'>[],
): string => {
  return `
    <h1>Eventos próximos</h1>
    <p>Hola, los siguientes eventos son próximos:</p>
    <ul>
      ${events.map((event) => `<li>${event.id} - ${event.event_date}</li>`).join('')}
    </ul>
  `;
};
