import { brandEmailTemplate, EmailBranding } from '../brandLayout';

/**
 * Confirmación al cliente que envió una solicitud por el formulario
 * público (rediseño 29-07, copy aprobado por Felipe). El formulario
 * público no entrega el nombre a este template, por eso el saludo es
 * genérico; se personaliza cuando la solicitud viaje con el nombre.
 */
export const newPublicQuotationClientTemplate = (
  branding: EmailBranding,
): string => {
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16.5px;font-weight:700;">¡Hola!</p>
    <p style="margin:0 0 14px;">Tu solicitud ya está en manos de nuestro equipo. La revisaremos con calma y te enviaremos una cotización a tu medida muy pronto.</p>
    <p style="margin:0 0 14px;">Si quieres agregar algún detalle mientras tanto, responde este mismo correo.</p>`;

  return brandEmailTemplate({
    branding,
    bodyHtml,
  });
};
