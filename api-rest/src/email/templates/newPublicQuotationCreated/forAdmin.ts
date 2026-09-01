import { brandEmailTemplate, EmailBranding } from '../brandLayout';

/** Lo que el formulario público sabe de la solicitud: el aviso al
 *  administrador lo muestra para decidir sin entrar al sistema
 *  (Felipe, 01-09: "debería ver cantidad de personas y nombre"). */
export interface NewPublicQuotationAdminParams {
  clientName: string;
  peopleCount: number;
  eventType?: string | null;
  eventDate?: string | null;
  phone?: string | null;
  email?: string | null;
  observations?: string | null;
}

const fila = (etiqueta: string, valor: string): string => `
  <tr>
    <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">${etiqueta}</td>
    <td style="padding:6px 12px;color:#111827;font-size:14px;font-weight:600;">${valor}</td>
  </tr>`;

// Los datos vienen del formulario público (los escribe un desconocido):
// se neutralizan < y > para que no viajen como HTML.
const limpio = (texto: string): string =>
  texto.replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fechaLegible = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/**
 * Aviso interno con la CABECERA DE MARCA de la casa (Felipe, 01-09:
 * "reciclaría lo que hicimos... vamos" tras ver que la genérica de
 * EVENTIA llegaba como bloque blanco en Outlook). El subtítulo bajo el
 * nombre de la empresa es el TÍTULO del correo, no el tagline: en un
 * correo interno lo que sirve es saber qué pasó de un vistazo.
 */
export const newPublicQuotationAdminTemplate = (
  params?: NewPublicQuotationAdminParams,
  branding?: EmailBranding,
): string => {
  const filas = params
    ? [
        fila('Cliente', limpio(params.clientName)),
        fila('Personas', String(params.peopleCount)),
        params.eventType ? fila('Evento', limpio(params.eventType)) : '',
        params.eventDate ? fila('Fecha', fechaLegible(params.eventDate)) : '',
        params.phone ? fila('Teléfono', limpio(params.phone)) : '',
        params.email ? fila('Correo', limpio(params.email)) : '',
      ].join('')
    : '';
  const observaciones = params?.observations?.trim()
    ? `<p style="margin:16px 0 0;padding:12px;background:#f9fafb;border-radius:8px;color:#374151;font-size:13px;">
        <span style="color:#6b7280;">Comentario del cliente:</span><br/>
        ${limpio(params.observations.trim())}
      </p>`
    : '';
  const bodyHtml = `
    <p style="margin:0 0 12px;">Llegó una nueva solicitud de cotización desde el link público.</p>
    ${
      filas
        ? `<table cellpadding="0" cellspacing="0" style="margin:4px 0;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;width:100%;">${filas}</table>`
        : ''
    }
    ${observaciones}
    <p style="color:#6b7280;font-size:13px;">
      En el sistema aparece con "[Desde formulario publico]" en las observaciones.
    </p>`;
  return brandEmailTemplate({
    branding: {
      ...(branding ?? { companyName: 'Eventia' }),
      // el título del correo en el lugar del tagline
      tagline: 'Nueva solicitud de cotización',
      // sin botón de portal en un correo interno
      portalUrl: null,
    },
    bodyHtml,
    cta: {
      text: 'Ver la solicitud',
      link: 'https://www.eventi-app.com/requests',
    },
    footerNote: 'Mensaje automático de Eventia. No respondas a este correo.',
  });
};
