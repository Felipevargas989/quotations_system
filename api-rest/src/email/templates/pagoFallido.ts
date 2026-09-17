import { correoInternoTemplate } from './brandLayout';

export type PagoFallidoParams = {
  companyName?: string | null;
  /** ISO. Hasta cuándo dura la gracia antes del bloqueo. */
  graciaHasta?: string | null;
};

/**
 * "Tu pago no pasó" (16-09-2026, sprint B del paso 4+5). Sale cuando
 * Mercado Pago rechaza un cobro mensual, o cuando el reloj pesca un
 * "pagado hasta" vencido sin aviso. Tono de la casa: sin drama y con
 * la salida en la mano — 7 días de gracia (decisión 2) y el botón
 * lleva directo a la pantalla de planes, donde se arregla.
 */
export const pagoFallidoTemplate = (p: PagoFallidoParams = {}): string => {
  const escapar = (t: string) =>
    t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const empresa = p.companyName ? escapar(p.companyName) : null;
  const gracia = p.graciaHasta
    ? new Date(p.graciaHasta).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Santiago',
      })
    : null;
  const bodyHtml = `
    <h2 style="font-size:24px;font-weight:600;color:#111827;margin:0 0 16px;text-align:center;">No pudimos cobrar tu plan</h2>
    <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 18px;text-align:center;">
      ${
        empresa
          ? `El cobro mensual de <strong>${empresa}</strong> no pasó.`
          : 'El cobro mensual de tu plan no pasó.'
      }
      Suele ser la tarjeta: sin fondos ese día, vencida o bloqueada por el banco.
    </p>
    <div style="background:#fef3c7;border-radius:12px;padding:18px;margin:0 0 18px;">
      <p style="font-size:14px;color:#92400e;line-height:1.6;margin:0;text-align:center;">
        <strong>Tu cuenta sigue funcionando con normalidad${gracia ? ` hasta el ${gracia}` : ' durante 7 días'}.</strong><br/>
        En ese plazo puedes actualizar tu tarjeta y todo sigue igual;
        si no, la cuenta se pausa — sin borrar nada — hasta que el pago se ponga al día.
      </p>
    </div>
    <p style="font-size:13px;color:#4b5563;text-align:center;margin:0;">
      Si ya lo arreglaste, no tienes que hacer nada más: Mercado Pago
      reintenta solo. ¿Dudas? Responde este correo y te ayudamos.
    </p>`;
  return correoInternoTemplate({
    titulo: 'Tu pago no pasó',
    bodyHtml,
    cta: {
      text: 'Revisar mi plan',
      link: 'https://www.eventi-app.com/plans',
    },
  });
};
