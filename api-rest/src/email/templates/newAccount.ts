import { correoInternoTemplate } from './brandLayout';

/**
 * Bienvenida al crear una cuenta nueva. Con la cabecera de marca de la
 * casa desde el 02-09 (marca Eventia: la empresa recién creada todavía
 * no tiene logo ni colores propios). Los estilos van EN LÍNEA: los del
 * <style> los botaba Outlook y el correo llegaba a medio vestir.
 */
export const newAccountTemplate = (): string => {
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
  const bodyHtml = `
    <h2 style="font-size:24px;font-weight:600;color:#111827;margin:0 0 16px;text-align:center;">¡Bienvenido a Eventia! 🎉</h2>
    <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 24px;text-align:center;">
      Estamos emocionados de tenerte en nuestra plataforma. Eventia es tu
      solución integral para la gestión de cotizaciones y eventos,
      diseñada para hacer tu trabajo más fácil y eficiente.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:22px;margin:0 0 18px;">
      ${feature('📋', 'Gestión de Cotizaciones', 'Crea, edita y envía cotizaciones profesionales en minutos')}
      ${feature('👥', 'Control de Clientes', 'Administra tu cartera de clientes de forma centralizada')}
      ${feature('📊', 'Análisis y Reportes', 'Obtén insights valiosos sobre tu negocio')}
      ${feature('🎨', 'Personalización', 'Adapta la plataforma con tus colores y logo de marca')}
    </div>
    <p style="font-size:13px;color:#4b5563;text-align:center;margin:0;">
      ¿Necesitas ayuda para comenzar? Nuestro equipo está aquí para
      apoyarte en cada paso del camino.
    </p>`;
  return correoInternoTemplate({
    titulo: 'Tu cuenta está lista',
    bodyHtml,
    cta: { text: 'Comenzar ahora', link: 'https://www.eventi-app.com/' },
  });
};
