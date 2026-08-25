/**
 * La plantilla de la casa para campañas (Fase 1): cabecera con el
 * nombre de la empresa, título, cuerpo, botón opcional y el pie con la
 * BAJA OBLIGATORIA (ley chilena de correos comerciales — regla 2 del
 * documento 11). Sin editor libre: campos, a propósito.
 */
export const plantillaCampana = (p: {
  empresa: string;
  titulo: string;
  cuerpoHtml: string;
  botonTexto?: string | null;
  botonUrl?: string | null;
  bajaUrl: string;
}): string => `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${p.titulo}</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#166534 0%,#15803d 100%);padding:32px 20px;text-align:center;">
      <p style="font-size:26px;font-weight:700;color:#ffffff;margin:0;letter-spacing:1px;">${p.empresa}</p>
    </div>
    <div style="padding:36px 30px;color:#111827;">
      <h1 style="font-size:22px;margin:0 0 16px;">${p.titulo}</h1>
      <div style="font-size:15px;line-height:1.65;color:#374151;">${p.cuerpoHtml}</div>
      ${
        p.botonTexto && p.botonUrl
          ? `<div style="text-align:center;margin:30px 0 8px;">
        <a href="${p.botonUrl}" style="display:inline-block;background:linear-gradient(135deg,#166534 0%,#14532d 100%);color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px;font-size:15px;">${p.botonTexto}</a>
      </div>`
          : ''
      }
    </div>
    <div style="padding:18px 30px 26px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">
        Recibes este correo por tu relación con ${p.empresa}.
        <a href="${p.bajaUrl}" style="color:#6b7280;">Dejar de recibir estos correos</a>
      </p>
    </div>
  </div>
</body>
</html>`;

/** Reemplaza {nombre} y {empresa} respetando texto plano → HTML simple. */
export const personalizar = (
  texto: string,
  destinatario: { name?: string | null; empresa?: string | null },
): string =>
  texto
    .replaceAll('{nombre}', destinatario.name?.trim() || 'estimado cliente')
    .replaceAll('{empresa}', destinatario.empresa?.trim() || 'su organización');

/** El cuerpo escrito en texto plano se vuelve párrafos HTML. */
export const cuerpoAHtml = (cuerpo: string): string =>
  cuerpo
    .split(/\n{2,}/)
    .map(
      (parr) =>
        `<p style="margin:0 0 14px;">${parr.replaceAll('\n', '<br/>')}</p>`,
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
