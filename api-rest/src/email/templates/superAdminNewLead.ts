import { baseLayoutTemplate } from './baseLayout';
import { escaparHtml } from './utils';

// Torre de Control (tanda 1, 05-08): un interesado dejó sus datos en
// "Prueba gratis". Plantilla simple estilo de la casa (referencia:
// newAccount). TODO dato del visitante viaja escapado (cura 05-08).
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
          <td style="padding: 6px 14px; color: #6b7280; font-size: 14px;">${etiqueta}</td>
          <td style="padding: 6px 14px; color: #111827; font-size: 14px; font-weight: 600;">${escaparHtml(valor)}</td>
        </tr>`
      : '';

  const content = `
    <style>
      .lead-title {
        font-size: 24px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 16px;
        text-align: center;
      }
      .lead-table {
        margin: 0 auto 24px;
        border-collapse: collapse;
        background-color: #f9fafb;
        border-radius: 12px;
      }
    </style>
    <h2 class="lead-title">🔔 Nuevo interesado en Eventia</h2>
    <table class="lead-table">
      ${fila('Nombre', params.nombre)}
      ${fila('Teléfono', params.telefono)}
      ${fila('Correo', params.email)}
      ${fila('Empresa', params.nombre_empresa)}
      ${fila('Personas en la empresa', params.personas_empresa)}
      ${fila('Ventas anuales', params.ventas_anuales)}
    </table>
  `;

  return baseLayoutTemplate({
    content,
  });
};
