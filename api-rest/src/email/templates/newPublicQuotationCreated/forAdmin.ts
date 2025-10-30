import { baseLayoutTemplate } from '../baseLayout';

export const newPublicQuotationAdminTemplate = (): string => {
  const content = `
    <p>Hola,</p>
    <p>Se ha recibido una nueva solicitud de cotización desde el link público.</p>
    <p>
      Esta cotización aparecerá con el comentario "Desde formulario publico" en el campo de observaciones.
    </p>
    `;
  return baseLayoutTemplate({
    content,
    cta: {
      text: 'Ver Solicitud',
      link: 'https://www.eventi-app.com/requests',
    },
  });
};
