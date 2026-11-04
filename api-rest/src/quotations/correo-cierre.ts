import { escaparHtml } from 'src/email/templates/utils';
import { fechaLargaDelEvento, primerNombre } from './correo-cotizacion';
import type { Quotation } from './entities/quotation.entity';

/**
 * EL AVISO DE CIERRE (Felipe, 04-11-2026): al marcar una cotización
 * como Rechazada, la pantalla pregunta «¿Avisarle al cliente?» y, si sí,
 * sale este correo. Texto fijo pero EDITABLE en el pop-up antes de
 * enviar; con tú, como escribe la casa.
 *
 * Reglas de la skill de correos hechas código: se agradece SIEMPRE el
 * interés y el tiempo, temprano; jamás «rechazada» (dicho desde nuestro
 * lado suena a reproche: se escribe «damos por cerrada»); se libera la
 * fecha y se deja la puerta abierta sin amargura.
 */
export const borradorDeCierre = (
  q: Quotation,
  marca: { nombre: string },
  nombreContacto: string | null,
): { asunto: string; cuerpo: string } => {
  const saludo = primerNombre(nombreContacto);
  const evento = String(q.event_type || 'evento').toLowerCase();
  const fecha = q.event_date ? fechaLargaDelEvento(q.event_date) : '';
  const asunto = `Gracias por considerarnos · Cotización N.º ${String(q.quotation_number)}`;
  const cuerpo = [
    `Hola${saludo ? ` ${saludo}` : ''}:`,
    `Te agradecemos sinceramente el tiempo y el interés que dedicaste a nuestra propuesta para tu ${evento}${fecha ? ` del ${fecha}` : ''}.`,
    'Lamentamos que en esta oportunidad no haya sido posible concretarlo. Damos la cotización por cerrada y la fecha queda liberada.',
    'Esperamos tener el gusto de acompañarte en un próximo evento. Si retoman la idea, escríbenos y con gusto la actualizamos.',
    `Saludos cordiales,\nEquipo ${marca.nombre}`,
  ].join('\n\n');
  return { asunto, cuerpo };
};

/** El texto editado en el pop-up, vestido como los párrafos del correo
 *  de la cotización: una línea en blanco separa párrafos y un salto
 *  simple es un <br />. Todo escapado: lo escribe una persona. */
export const cuerpoHtmlDeCierre = (texto: string): string =>
  texto
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 14px;">${escaparHtml(
          p,
        ).replace(/\n/g, '<br />')}</p>`,
    )
    .join('\n');
