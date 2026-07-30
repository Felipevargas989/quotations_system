import { WeeklyDigestParams } from './types';

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const AZUL = '#134686';

const seccion = (titulo: string, contenido: string): string => `
  <h4 style="font-size:13px;letter-spacing:0.07em;text-transform:uppercase;color:${AZUL};border-bottom:2px solid #e8eef7;padding-bottom:6px;margin:18px 0 8px;font-family:${FONT};">${titulo}</h4>
  ${contenido}`;

const fila = (main: string, side: string): string => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:14.5px;color:#1f2937;font-family:${FONT};">${main}</td>
    <td align="right" style="padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:14.5px;color:#6b7280;white-space:nowrap;font-family:${FONT};">${side}</td>
  </tr></table>`;

/**
 * Resumen semanal interno. Legible en 30 segundos: eventos de la
 * semana primero, después el estado del pipeline. Solo se envía si
 * hay algo que contar (lo decide el cron).
 */
export const weeklyDigestTemplate = (params: WeeklyDigestParams): string => {
  const eventosHtml = params.eventos.length
    ? params.eventos
        .map((e) =>
          fila(
            `<b>${e.fecha}</b> · ${e.tipo}`,
            e.personas ? `${e.personas} personas` : '',
          ),
        )
        .join('')
    : `<p style="font-size:14px;color:#6b7280;font-family:${FONT};margin:4px 0;">Sin eventos agendados esta semana.</p>`;

  const p = params.pipeline;
  const pipelineHtml = fila(
    `${p.solicitadas} solicitadas · ${p.enviadas} enviadas · ${p.enNegociacion} en negociación`,
    '',
  );

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tu semana en Eventia</title></head>
<body style="margin:0;padding:0;background:#eceff2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceff2;padding:24px 8px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${FONT};color:#1f2937;font-size:15px;line-height:1.6;">
      <tr><td style="background:${AZUL};height:6px;font-size:2px;line-height:6px;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;padding:22px 32px 16px;border-bottom:1px solid #eef1f4;">
        <div style="color:${AZUL};font-size:21px;font-weight:800;font-family:${FONT};">Tu semana en Eventia</div>
        <div style="color:#6b7280;font-size:13px;margin-top:2px;">${params.companyName} · ${params.weekLabel}</div>
      </td></tr>
      <tr><td style="padding:10px 32px 24px;">
        ${seccion('📅 Eventos de la semana', eventosHtml)}
        ${seccion('📋 Cotizaciones en curso', pipelineHtml)}
      </td></tr>
      <tr><td style="border-top:1px solid #e5e7eb;padding:16px 32px 20px;font-size:12.5px;color:#9ca3af;">
        Este resumen semanal reemplaza los correos diarios de eventos y cotizaciones.<br>
        Los avisos de cobranza siguen llegando al momento, cuando corresponde.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
};
