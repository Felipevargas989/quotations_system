import { baseLayoutTemplate } from './baseLayout';

// Torre de Control (tanda 1, 05-08): se creó una empresa nueva en la
// plataforma. Plantilla simple estilo de la casa.
export const superAdminNewCompanyTemplate = (nombre: string): string => {
  const nombreLimpio = nombre || '';
  const content = `
    <style>
      .company-title {
        font-size: 24px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 16px;
        text-align: center;
      }
      .company-message {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0 0 24px 0;
        text-align: center;
      }
    </style>
    <h2 class="company-title">🏢 Nueva empresa en Eventia</h2>
    <p class="company-message">
      Se creó la empresa <strong>${nombreLimpio}</strong>.
    </p>
  `;

  return baseLayoutTemplate({
    content,
  });
};
