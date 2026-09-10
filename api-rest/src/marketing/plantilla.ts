/** La pila tipográfica del correo, en un solo lugar: Outlook de
 *  escritorio necesita que vaya en CADA celda de texto, no solo en el
 *  <body> (no hereda estilos como un navegador). */
const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif";

/** La marca de la empresa que viste el correo (Configuración, migraciones 95-96). */
export interface MarcaEmpresa {
  nombre: string;
  /** Una IMAGEN se ve idéntica en modo claro y oscuro (los modos
   *  oscuros repintan fondos y textos, jamás imágenes). */
  logo: string | null;
  /** El banner ancho (~1200×300): cuando existe REEMPLAZA el
   *  encabezado completo — la marca ya viene adentro. */
  banner: string | null;
  tagline: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  sitioWeb: string | null;
  colorPrimario: string;
  colorSecundario: string;
  /** "Responder a" (Configuración → Notificaciones): las respuestas
   *  llegan a la casilla real de la empresa, no al dominio de envío.
   *  Va en el sobre del correo, no en la plantilla. */
  replyTo: string | null;
}

/** El link abreviado de WhatsApp desde el número chileno: se limpia y
 *  se antepone 56 si falta. Número imposible → sin link (sin botón). */
export const linkDeWhatsApp = (numero: string): string | null => {
  const digitos = numero.replace(/\D/g, '');
  if (digitos.length < 8) return null;
  return `https://wa.me/${digitos.startsWith('56') ? digitos : `56${digitos}`}`;
};

/** Links pegados sin https:// quedan absolutos igual. */
export const urlAbsoluta = (u: string): string =>
  /^https?:\/\//i.test(u) ? u : `https://${u}`;

/** Escape HTML para todo texto que viene de datos (nombres, cuerpo,
 *  asunto, urls en atributos): una comilla o un < en el nombre de un
 *  contacto no puede romper el correo (revisión 26-08). */
export const esc = (t: string): string =>
  t
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** ¿El color es claro? (luminancia simple sobre #rrggbb). Colores
 *  raros o inválidos se tratan como oscuros. */
export const esClaro = (hex: string): boolean => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum =
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255;
  return lum > 0.62;
};

/** Texto legible sobre un fondo dado: oscuro sobre claro, blanco
 *  sobre oscuro. La revisión pilló que usar el color secundario de la
 *  paleta como texto/fondo quedaba ilegible con paletas saturadas. */
export const textoSobre = (fondo: string): string =>
  esClaro(fondo) ? '#111827' : '#ffffff';

/**
 * La plantilla de campañas (diseño validado por Felipe el 25-08):
 * encabezado BLANCO pintado con el nombre a la izquierda (color
 * primario de la paleta de la empresa) y el logo grande a la derecha;
 * cuerpo; DOS BOTONES por defecto — WhatsApp (verde universal) y el
 * formulario público de cotización (color primario) —; y la franja de
 * cierre en el color secundario con nombre, tagline y redes. Estilos
 * en línea y tablas: a los clientes de correo no se les confía más.
 * Piezas obligadas: PREENCABEZADO oculto y BAJA (ley chilena, doc 11).
 * Sin editor libre: campos, a propósito.
 */
export const plantillaCampana = (p: {
  marca: MarcaEmpresa;
  titulo: string;
  cuerpoHtml: string;
  /** Sin bajaUrl, el pie va sin la línea de baja: el correo del embudo
   *  de consultas es RESPUESTA a una solicitud, no campaña (05-09). */
  bajaUrl?: string | null;
  /** Sin cotizarUrl no hay botón primario (la consulta ya cotizó: lo
   *  que se busca es que RESPONDA el correo). */
  cotizarUrl?: string | null;
  /** Origen del frontend: ahí viven los íconos (public/correo/*.png). */
  iconosBase: string;
  preencabezado?: string | null;
}): string => {
  const m = p.marca;
  const whatsappUrl = m.whatsapp ? linkDeWhatsApp(m.whatsapp) : null;
  // Colores legibles con CUALQUIER paleta (revisión 26-08): el nombre
  // sobre el primario elige blanco/negro solo, y la franja usa el
  // secundario únicamente si es claro — si es un acento saturado
  // (p. ej. el verde por defecto de Configuración), va neutro claro.
  const nombreSobrePrimario = textoSobre(m.colorPrimario);
  const fondoFranja = esClaro(m.colorSecundario)
    ? m.colorSecundario
    : '#f9fafb';
  const nombre = esc(m.nombre);
  // TODO EN TABLAS, POR OUTLOOK DE ESCRITORIO (Felipe, 10-09-2026: "las
  // respuestas se están viendo así", con franjas grises entre párrafos y
  // los botones aplastados). Outlook de escritorio no dibuja con un
  // motor de navegador sino con el de Word, que IGNORA max-width y el
  // fondo de un <div>: el blanco del contenedor no cubría y en los
  // márgenes entre párrafos se asomaba el gris del fondo. La estructura
  // es ahora tabla dentro de tabla, con bgcolor además del estilo, y los
  // botones son celdas con mso-padding-alt en vez de <a> con padding.
  // Las "ghost tables" (comentarios condicionales <!--[if mso]-->) solo
  // las lee Outlook: fijan el ancho de 600 y ponen los botones lado a
  // lado; el resto de los clientes las ignora y usa max-width.
  const pilaTipografica = FUENTE;
  // Ancho FIJO e igual para ambos botones (Felipe, 02-09: "¿podrían
  // tener el mismo ancho?"): 250px cada uno — apilados se ven parejos,
  // y lado a lado caben en los 540px útiles del correo.
  const boton = (url: string, color: string, texto: string, glifo?: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;display:inline-block;vertical-align:top;margin:0 8px 12px;"><tr><td align="center" bgcolor="${color}" style="background-color:${color};border-radius:8px;width:250px;mso-padding-alt:13px 0;"><a href="${esc(url)}" style="display:block;width:250px;padding:13px 0;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-family:${pilaTipografica};">${
      glifo
        ? `<img src="${p.iconosBase}/correo/${glifo}" width="18" height="18" alt="" style="display:inline-block;border:0;vertical-align:-4px;margin-right:8px;" />`
        : ''
    }${texto}</a></td></tr></table>`;
  // Los íconos clásicos (pedido de Felipe 25-08): imágenes, porque los
  // modos oscuros no las repintan — se ven iguales siempre.
  const icono = (url: string, archivo: string, alt: string) =>
    `<a href="${esc(urlAbsoluta(url))}" style="text-decoration:none;"><img src="${p.iconosBase}/correo/${archivo}" width="26" height="26" alt="${esc(alt)}" style="display:inline-block;border:0;vertical-align:middle;margin:0 7px;" /></a>`;
  const redes = [
    m.instagram && icono(m.instagram, 'instagram.png', 'Instagram'),
    m.facebook && icono(m.facebook, 'facebook.png', 'Facebook'),
    m.sitioWeb && icono(m.sitioWeb, 'web.png', 'Sitio web'),
  ].filter(Boolean);
  // Los botones que existan, lado a lado en Outlook por la ghost table.
  const botones = [
    p.cotizarUrl ? boton(p.cotizarUrl, m.colorPrimario, 'Cotiza aquí') : '',
    whatsappUrl
      ? boton(whatsappUrl, '#25D366', 'Escríbenos al WhatsApp', 'whatsapp.png')
      : '',
  ].filter(Boolean);
  const bloqueBotones = botones.length
    ? `<div style="margin:30px 0 4px;text-align:center;">
          <!--[if mso]><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><![endif]-->
          ${botones.join(
            '\n          <!--[if mso]></td><td align="center"><![endif]-->\n          ',
          )}
          <!--[if mso]></td></tr></table><![endif]-->
        </div>`
    : '';
  const encabezado = m.banner
    ? `<tr><td bgcolor="#ffffff" style="padding:0;background-color:#ffffff;"><img src="${esc(m.banner)}" alt="${nombre}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" /></td></tr>`
    : `<tr><td bgcolor="${m.colorPrimario}" style="padding:0;background-color:${m.colorPrimario};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:24px 30px;vertical-align:middle;font-family:${pilaTipografica};">
                <p style="font-size:24px;font-weight:700;color:${nombreSobrePrimario};margin:0;letter-spacing:0.5px;mso-line-height-rule:exactly;line-height:30px;">${nombre}</p>
              </td>
              ${
                m.logo
                  ? `<td align="right" style="padding:16px 30px;vertical-align:middle;"><img src="${esc(m.logo)}" alt="${nombre}" height="76" style="display:block;max-height:76px;border:0;" /></td>`
                  : ''
              }
            </tr>
          </table>
        </td></tr>`;
  return `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(p.titulo)}</title><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--></head>
<body style="margin:0;padding:0;width:100%;background-color:#f3f4f6;font-family:${pilaTipografica};">
  ${
    p.preencabezado
      ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(p.preencabezado)}&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;</div>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="border-collapse:collapse;background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-collapse:collapse;width:100%;max-width:600px;background-color:#ffffff;">
          ${encabezado}
          <tr>
            <td bgcolor="#ffffff" style="padding:36px 30px;background-color:#ffffff;color:#111827;font-family:${pilaTipografica};">
              <h1 style="font-size:22px;margin:0 0 16px;mso-line-height-rule:exactly;line-height:28px;">${esc(p.titulo)}</h1>
              <div style="font-size:15px;line-height:1.65;mso-line-height-rule:exactly;color:#374151;">${p.cuerpoHtml}</div>
              ${bloqueBotones}
            </td>
          </tr>
          <tr>
            <td bgcolor="${fondoFranja}" style="background-color:${fondoFranja};padding:24px 30px;text-align:center;font-family:${pilaTipografica};">
              <p style="font-size:15px;font-weight:700;color:${m.colorPrimario};margin:0;">${nombre}</p>
              ${m.tagline ? `<p style="font-size:12px;color:#4b5563;margin:4px 0 0;">${esc(m.tagline)}</p>` : ''}
              ${redes.length ? `<p style="margin:14px 0 0;">${redes.join('')}</p>` : ''}
              ${
                p.bajaUrl
                  ? `<p style="font-size:11px;color:#6b7280;margin:16px 0 0;">
                Recibes este correo por tu relación con ${nombre}.
                <a href="${p.bajaUrl}" style="color:${m.colorPrimario};text-decoration:none;font-weight:500;">Dejar de recibir estos correos</a>
              </p>`
                  : ''
              }
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * LA REGLA DEL REENVÍO (manual de los grandes): la segunda pasada sale
 * con asunto NUEVO, nunca el mismo. Pura para poder probarla; devuelve
 * el asunto limpio o el motivo del rechazo.
 */
export const validarAsuntoDeReenvio = (
  original: string,
  nuevo: string | undefined,
): { asunto: string } | { error: string } => {
  const limpio = (nuevo ?? '').trim();
  if (!limpio) {
    return { error: 'Escribe un asunto nuevo para la segunda pasada' };
  }
  if (limpio.toLowerCase() === original.trim().toLowerCase()) {
    return {
      error: 'El asunto del reenvío debe ser distinto al original',
    };
  }
  return { asunto: limpio.slice(0, 200) };
};

/** Reemplaza {nombre} y {empresa}. SIN escape acá: el asunto es texto
 *  plano (Resend lo quiere crudo) y los sumideros HTML (título, cuerpo,
 *  preencabezado) escapan ellos — escapar dos veces mostraba &amp;. */
export const personalizar = (
  texto: string,
  destinatario: { name?: string | null; empresa?: string | null },
): string =>
  texto
    .replaceAll('{nombre}', destinatario.name?.trim() || 'estimado cliente')
    .replaceAll('{empresa}', destinatario.empresa?.trim() || 'su organización');

/** *negrita* y _cursiva_, el idioma de WhatsApp (Felipe 26-08).
 *  Corre DESPUÉS de esc(), así que solo produce las etiquetas nuestras.
 *  El delimitador debe abrir pegado al texto y el par vivir en una
 *  línea: juan_perez@gmail.com y "2 * 3 * 4" quedan en paz. */
const formatoWhatsApp = (texto: string): string =>
  texto
    .replace(
      /(^|[\s(¡¿>])\*([^*\s\n][^*\n]*?)\*(?=$|[\s).,;:!?…<])/gm,
      '$1<strong>$2</strong>',
    )
    .replace(
      /(^|[\s(¡¿>])_([^_\s\n][^_\n]*?)_(?=$|[\s).,;:!?…<])/gm,
      '$1<em>$2</em>',
    );

/** El cuerpo escrito en texto plano se vuelve párrafos HTML. */
export const cuerpoAHtml = (cuerpo: string): string =>
  cuerpo
    .split(/\n{2,}/)
    .map(
      (parr) =>
        `<p style="margin:0 0 14px;">${formatoWhatsApp(esc(parr)).replaceAll('\n', '<br/>')}</p>`,
    )
    .join('');

/**
 * EL RESOLVEDOR DE DESTINATARIOS, puro para poder probarlo:
 * dedupe por correo (regla de una vez dentro de la misma lista),
 * fuera los suprimidos y los que ya recibieron esta campaña.
 */
export const resolverDestinatarios = (
  candidatos: readonly {
    email: string;
    name?: string | null;
    empresa?: string | null;
  }[],
  suprimidos: ReadonlySet<string>,
  yaEnviados: ReadonlySet<string>,
): { email: string; name: string | null; empresa: string | null }[] => {
  const vistos = new Set<string>();
  const lista: {
    email: string;
    name: string | null;
    empresa: string | null;
  }[] = [];
  for (const c of candidatos) {
    const e = (c.email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) continue;
    if (vistos.has(e) || suprimidos.has(e) || yaEnviados.has(e)) continue;
    vistos.add(e);
    lista.push({ email: e, name: c.name ?? null, empresa: c.empresa ?? null });
  }
  return lista;
};
