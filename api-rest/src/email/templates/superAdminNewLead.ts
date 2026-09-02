import { correoInternoTemplate } from './brandLayout';
import { escaparHtml } from './utils';

// Torre de Control (tanda 1, 05-08): un interesado dejó sus datos en
// "Prueba gratis". Con la cabecera de marca de la casa desde el 02-09
// (marca Eventia: es un aviso del SaaS, no de una empresa). TODO dato
// del visitante viaja escapado (cura 05-08).
export interface SuperAdminNewLeadParams {
  nombre: string;
  telefono: string;
  email: string;
  nombre_empresa?: string;
  personas_empresa?: string;
  ventas_anuales?: string;
}

export const superAdminNewLeadTemplate = (
  params: SuperAdminNewLeadParams,
): string => {
  // Solo las filas con dato: el formulario tiene campos opcionales.
  const fila = (etiqueta: string, valor?: string) =>
    valor
      ? `<tr>
          <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">${etiqueta}</td>
          <td style="padding:6px 12px;color:#111827;font-size:14px;font-weight:600;">${escaparHtml(valor)}</td>
        </tr>`
      : '';

  const bodyHtml = `
    <p style="margin:0 0 12px;">🔔 Un interesado dejó sus datos en
    "Prueba gratis":</p>
    <table cellpadding="0" cellspacing="0" style="margin:4px 0 12px;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;width:100%;">
      ${fila('Nombre', params.nombre)}
      ${fila('Teléfono', params.telefono)}
      ${fila('Correo', params.email)}
      ${fila('Empresa', params.nombre_empresa)}
      ${fila('Personas en la empresa', params.personas_empresa)}
      ${fila('Ventas anuales', params.ventas_anuales)}
    </table>`;

  return correoInternoTemplate({
    titulo: 'Nuevo interesado en Eventia',
    bodyHtml,
  });
};
