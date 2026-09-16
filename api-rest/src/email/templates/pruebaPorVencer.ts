import { correoInternoTemplate } from './brandLayout';

export type PruebaPorVencerParams = {
  companyName?: string | null;
  /** ISO. Cuándo vence la prueba. */
  pruebaVence?: string | null;
};

/**
 * "Te quedan 2 días de prueba" (16-09-2026, sprint B del paso 4+5).
 * Sale una sola vez por empresa, dos días antes del vencimiento (la
 * ventana del reloj lo garantiza). Vende sin apretar: dice la fecha,
 * recuerda que nada se borra y lleva a la pantalla de planes.
 */
export const pruebaPorVencerTemplate = (
  p: PruebaPorVencerParams = {},
): string => {
  const escapar = (t: string) =>
    t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const empresa = p.companyName ? escapar(p.companyName) : null;
  const vence = p.pruebaVence
    ? new Date(p.pruebaVence).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Santiago',
      })
    : null;
  const bodyHtml = `
    <h2 style="font-size:24px;font-weight:600;color:#111827;margin:0 0 16px;text-align:center;">Tu prueba está por terminar</h2>
    <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 18px;text-align:center;">
      ${
        empresa
          ? `La prueba gratis de <strong>${empresa}</strong>`
          : 'Tu prueba gratis'
      } termina${vence ? ` el <strong>${vence}</strong>` : ' en dos días'}.
      Para seguir sin cortes, elige tu plan desde la misma aplicación:
      son dos minutos y se paga solo, mes a mes, con Mercado Pago.
    </p>
    <p style="font-size:13px;color:#4b5563;text-align:center;margin:0;">
      Si la dejas vencer no se borra nada: tus cotizaciones, clientes y
      números quedan guardados esperándote. El día que contrates,
      encuentras todo donde lo dejaste.
    </p>`;
  return correoInternoTemplate({
    titulo: 'Tu prueba está por terminar',
    bodyHtml,
    cta: {
      text: 'Elegir mi plan',
      link: 'https://www.eventi-app.com/plans',
    },
  });
};
