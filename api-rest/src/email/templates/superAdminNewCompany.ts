import { correoInternoTemplate } from './brandLayout';
import { escaparHtml } from './utils';

// Torre de Control (tanda 1, 05-08): se creó una empresa nueva en la
// plataforma. El nombre viene del visitante y viaja ESCAPADO de verdad
// (cura 05-08: el viejo "nombreLimpio" era solo un coalesce mentiroso).
// Con la cabecera de marca de la casa desde el 02-09 (marca Eventia).
export const superAdminNewCompanyTemplate = (nombre: string): string => {
  const bodyHtml = `
    <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0;text-align:center;">
      🏢 Se creó la empresa <strong>${escaparHtml(nombre)}</strong>.
    </p>`;
  return correoInternoTemplate({
    titulo: 'Nueva empresa en Eventia',
    bodyHtml,
  });
};
