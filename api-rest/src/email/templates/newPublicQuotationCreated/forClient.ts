import { baseLayoutTemplate } from '../baseLayout';

/**
 * Email template for new public quotation submission
 * Sent to the client who submitted the quotation via public form
 * @returns HTML string for the email
 */
export const newPublicQuotationClientTemplate = (): string => {
  const content = `
    <p>Hola,</p>
    <p>Te contactamos a nombre de la empresa en donde acabas de hacer una solicitud de cotización para un evento.</p>
    <p>
      Te comentamos que la cotización ha sido recibida y se encuentra en proceso de revisión.
    </p>
    <p>
      Te contactaremos pronto para coordinar la siguiente etapa.
    </p>
    <p>
      Gracias por tu interés.
    </p>
    `;
  return baseLayoutTemplate({
    content,
  });
};
