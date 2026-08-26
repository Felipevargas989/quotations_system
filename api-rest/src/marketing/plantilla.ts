/**
 * La plantilla de campañas, en EL FORMATO DE LA CASA (Felipe, 25-08:
 * "muy similar al formato de cotización, homogéneo, estructurado y
 * elegante"): el mismo azul, cabecera, botón y pie que baseLayout.ts
 * usa en cotizaciones y seguimientos — con estilos en línea porque a
 * los clientes de correo no se les confía el <style>. Se suman las dos
 * piezas propias del marketing: el PREENCABEZADO oculto (la frase gris
 * de la bandeja) y la BAJA OBLIGATORIA (ley chilena — regla 2, doc 11).
 * Sin editor libre: campos, a propósito.
 */
export const plantillaCampana = (p: {
  empresa: string;
  titulo: string;
  cuerpoHtml: string;
  botonTexto?: string | null;
  botonUrl?: string | null;
  bajaUrl: string;
  preencabezado?: string | null;
}): string => `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${p.titulo}</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  ${
    p.preencabezado
      ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${p.preencabezado}&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;</div>`
      : ''
  }
  <div style="background-color:#f3f4f6;padding:20px 0;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#134686 0%,#1e5a9e 100%);padding:40px 20px;text-align:center;">
        <p style="font-size:32px;font-weight:700;color:#ffffff;margin:0;letter-spacing:1px;">${p.empresa}</p>
      </div>
      <div style="padding:40px 30px;color:#111827;">
        <h1 style="font-size:22px;margin:0 0 16px;">${p.titulo}</h1>
        <div style="font-size:15px;line-height:1.65;color:#374151;">${p.cuerpoHtml}</div>
        ${
          p.botonTexto && p.botonUrl
            ? `<div style="text-align:center;margin:30px 0 8px;">
          <a href="${p.botonUrl}" style="display:inline-block;background:linear-gradient(135deg,#134686 0%,#0f3a6b 100%);color:#ffffff;text-decoration:none;font-weight:600;padding:14px 36px;border-radius:8px;font-size:15px;box-shadow:0 4px 6px rgba(19,70,134,0.25);">${p.botonTexto}</a>
        </div>`
            : ''
        }
      </div>
      <div style="background-color:#f9fafb;padding:24px 30px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">
          Recibes este correo por tu relación con ${p.empresa}.
        </p>
        <p style="font-size:12px;color:#6b7280;margin:0;">
          <a href="${p.bajaUrl}" style="color:#134686;text-decoration:none;font-weight:500;">Dejar de recibir estos correos</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

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
