import { esc } from './convenio-plantilla';

/**
 * Los textos de los tres correos del convenio (doc 24). El marco (logo,
 * colores, pie) lo pone `plantillaCampana`, como en todo Eventia; aquí va
 * solo el cuerpo. Nada de nombres escritos a mano: la empresa sale de su
 * marca y el cliente de su ficha.
 */

const P = 'margin:0 0 14px;font-size:15px;line-height:22px;color:#1f2937;';

const boton = (url: string, color: string, texto: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px;border-collapse:separate;"><tr><td align="center" bgcolor="${color}" style="background-color:${color};border-radius:8px;"><a href="${esc(url)}" style="display:block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;">${esc(texto)}</a></td></tr></table>`;

const listaDeBeneficios = (
  beneficios: { titulo: string; detalle?: string | null }[],
) =>
  beneficios.length
    ? `<ul style="margin:0 0 14px 18px;padding:0;">${beneficios
        .map(
          (b) =>
            `<li style="margin:0 0 6px;font-size:15px;line-height:22px;color:#1f2937;"><strong>${esc(
              b.titulo,
            )}</strong>${b.detalle ? ` — ${esc(b.detalle)}` : ''}</li>`,
        )
        .join('')}</ul>`
    : '';

/** La invitación a aceptar el convenio, con el enlace personal. */
export const correoDeInvitacion = (p: {
  empresa: string;
  cliente: string;
  nombre: string;
  titulo: string;
  beneficios: { titulo: string; detalle?: string | null }[];
  enlace: string;
  color: string;
}) => ({
  asunto: `${p.titulo} con ${p.empresa}`,
  titulo: p.titulo,
  cuerpoHtml: `<p style="${P}">Hola ${esc(p.nombre)}:</p>
<p style="${P}">${esc(p.empresa)} te invita a firmar el ${esc(
    p.titulo.toLowerCase(),
  )} para las personas que trabajan en <strong>${esc(p.cliente)}</strong>. No tiene costo: los beneficios rigen desde la firma.</p>
${listaDeBeneficios(p.beneficios)}
<p style="${P}">Puedes leer el convenio completo y aceptarlo en línea, en nombre de la empresa, desde este enlace personal:</p>
${boton(p.enlace, p.color, 'Revisar y aceptar el convenio')}
<p style="margin:16px 0 0;font-size:13px;line-height:19px;color:#6b7280;">Este enlace es solo para ti. Si no corresponde que tú lo aceptes, reenvíaselo a quien represente a la empresa.</p>`,
});

/** La copia para quien aceptó, con el PDF adjunto. */
export const correoDeCopia = (p: {
  empresa: string;
  razonSocial: string;
  nombre: string;
  titulo: string;
  fecha: string;
  vence: string;
}) => ({
  asunto: `${p.titulo} firmado · ${p.razonSocial}`,
  titulo: `${p.titulo} firmado`,
  cuerpoHtml: `<p style="${P}">Hola ${esc(p.nombre)}:</p>
<p style="${P}">Gracias por aceptar el ${esc(
    p.titulo.toLowerCase(),
  )} entre <strong>${esc(p.razonSocial)}</strong> y ${esc(p.empresa)}, el ${esc(p.fecha)}. Rige hasta el ${esc(p.vence)} y se renueva según lo que dice el convenio.</p>
<p style="${P}">Te adjuntamos el convenio en PDF, con la constancia de tu aceptación en línea. Guárdalo junto a los documentos de la empresa.</p>`,
});

/** El aviso a la empresa dueña: un cliente firmó. */
export const correoDeAviso = (p: {
  titulo: string;
  razonSocial: string;
  cliente: string;
  nombre: string;
  cargo: string;
  correo: string;
  fecha: string;
  vence: string;
  enlaceFicha: string;
  color: string;
  conPdf: boolean;
}) => ({
  asunto: `Convenio firmado · ${p.cliente}`,
  titulo: 'Un cliente firmó el convenio',
  cuerpoHtml: `<p style="${P}"><strong>${esc(p.razonSocial)}</strong> (cliente «${esc(
    p.cliente,
  )}») aceptó en línea el ${esc(p.titulo.toLowerCase())}.</p>
<p style="${P}">Aceptó: ${esc(p.nombre)}, ${esc(p.cargo)} · ${esc(p.correo)}<br>Fecha: ${esc(p.fecha)} · Vence: ${esc(p.vence)}</p>
<p style="${P}">${
    p.conPdf
      ? 'El PDF quedó en «Documentos del cliente», en su ficha.'
      : 'El PDF no se alcanzó a generar: en la ficha del cliente aparece «PDF pendiente» con el botón para generarlo.'
  }</p>
${boton(p.enlaceFicha, p.color, 'Abrir la ficha del cliente')}`,
});
