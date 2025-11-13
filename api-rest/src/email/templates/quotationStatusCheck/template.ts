import {
  QuotationStatus,
  STATUS_LABELS,
} from 'src/quotations/constants/constants';
import { baseLayoutTemplate } from '../baseLayout';
import { QuotationStatusCheckParams } from './types';

const buildStatusRows = (
  statusCounts: Partial<Record<QuotationStatus, number>>,
): string => {
  return Object.entries(statusCounts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([status, count]) => {
      const label = STATUS_LABELS[status as QuotationStatus] ?? status;
      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #374151;">
            ${label}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #134686;">
            ${count}
          </td>
        </tr>
      `;
    })
    .join('');
};

export const quotationStatusCheckTemplate = (
  params: QuotationStatusCheckParams,
): string => {
  const companyName = params.companyName ?? 'tu empresa';
  const rows = buildStatusRows(params.statusCounts);

  const content = `
    <style>
      .title {
        font-size: 20px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 16px 0;
      }
      .description {
        font-size: 16px;
        line-height: 1.6;
        color: #374151;
        margin: 0 0 24px 0;
      }
      .summary-card {
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
      }
      .summary-card p {
        margin: 0;
        font-size: 16px;
        color: #1f2937;
      }
      .status-table {
        width: 100%;
        border-collapse: collapse;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      }
      .status-table thead th {
        background: linear-gradient(135deg, #134686 0%, #1e5a9e 100%);
        color: #ffffff;
        font-weight: 600;
        text-align: left;
        padding: 14px 16px;
        font-size: 14px;
        letter-spacing: 0.02em;
      }
      .status-table tbody tr:last-child td {
        border-bottom: none;
      }
    </style>
    <h2 class="title">Hola, ${companyName} 👋</h2>
    <p class="description">
      Acá va un resumen diario de tus cotizaciones en proceso.
      Mantente al tanto y gestiona tus oportunidades en Eventia.
    </p>

    <div class="summary-card">
      <p><strong>Total de cotizaciones activas:</strong> ${params.totalQuotations}</p>
    </div>

    <table class="status-table">
      <thead>
        <tr>
          <th>Estado</th>
          <th style="text-align: right;">Cantidad</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows ||
          `
          <tr>
            <td colspan="2" style="padding: 16px; text-align: center; color: #6b7280;">
              No se encontraron cotizaciones pendientes por gestionar.
            </td>
          </tr>
        `
        }
      </tbody>
    </table>
  `;

  return baseLayoutTemplate({
    content,
    cta: {
      text: 'Ir a mis cotizaciones',
      link: 'https://www.eventi-app.com/quotations',
    },
  });
};
