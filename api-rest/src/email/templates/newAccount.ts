import { correoInternoTemplate } from './brandLayout';

export type NewAccountParams = {
  companyName?: string | null;
  /** ISO. Cuándo vence la prueba gratis de 7 días. */
  pruebaVence?: string | null;
};

/**
 * Bienvenida al crear una cuenta nueva. Con la cabecera de marca de la
 * casa desde el 02-09 (marca Eventia: la empresa recién creada todavía
 * no tiene logo ni colores propios). Los estilos van EN LÍNEA: los del
 * <style> los botaba Outlook y el correo llegaba a medio vestir.
 *
 * Desde el 16-09-2026 (paso 4, el alta por cuenta propia) deja de ser
 * genérica: saluda con el nombre de la empresa, dice hasta cuándo dura
 * la prueba y el botón lleva a INICIAR SESIÓN, no a la landing. Lo que
 * NO lleva, a propósito: la contraseña — las contraseñas no viajan por
 * correo (decisión 6, firmada el 16-09).
 */
export const newAccountTemplate = (p: NewAccountParams = {}): string => {
  const feature = (icono: string, titulo: string, texto: string) => `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 14px;"><tr>
      <td style="width:40px;vertical-align:top;">
        <div style="background:#134686;color:#ffffff;border-radius:8px;width:40px;height:40px;text-align:center;line-height:40px;font-size:20px;">${icono}</div>
      </td>
      <td style="padding-left:14px;vertical-align:top;">
        <div style="font-size:15px;font-weight:600;color:#111827;">${titulo}</div>
        <div style="font-size:13px;color:#6b7280;line-height:1.5;">${texto}</div>
      </td>
    </tr></table>`;
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
    <h2 style="font-size:24px;font-weight:600;color:#111827;margin:0 0 16px;text-align:center;">¡Bienvenido a Eventia! 🎉</h2>
    <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 24px;text-align:center;">
      ${
        empresa
          ? `La cuenta de <strong>${empresa}</strong> ya está creada y lista para usarse.`
          : 'Tu cuenta ya está creada y lista para usarse.'
      }
      ${
        vence
          ? ` Tienes <strong>7 días de prueba gratis con todo Eventia</strong>, hasta el ${vence}. Sin tarjeta y sin compromiso: si te sirve, eliges tu plan desde la misma aplicación.`
          : ''
      }
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:22px;margin:0 0 18px;">
      ${feature('📋', 'Gestión de Cotizaciones', 'Crea, edita y envía cotizaciones profesionales en minutos')}
      ${feature('👥', 'Control de Clientes', 'Administra tu cartera de clientes de forma centralizada')}
      ${feature('📊', 'Análisis y Reportes', 'Obtén insights valiosos sobre tu negocio')}
      ${feature('🎨', 'Personalización', 'Adapta la plataforma con tus colores y logo de marca')}
    </div>
    <p style="font-size:13px;color:#4b5563;text-align:center;margin:0;">
      Para entrar, usa el correo con que te registraste y tu contraseña.
      ¿Dudas? Responde por WhatsApp desde la aplicación y te ayudamos a
      dar los primeros pasos.
    </p>`;
  return correoInternoTemplate({
    titulo: 'Tu cuenta está lista',
    bodyHtml,
    // A INICIAR SESIÓN, no a la landing: el destinatario ya tiene cuenta.
    cta: { text: 'Entrar a Eventia', link: 'https://www.eventi-app.com/login' },
  });
};
