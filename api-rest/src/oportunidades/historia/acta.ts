// EL ACTA PÚBLICA DE ADJUDICACIÓN (decisión 30 del doc 17, 19-10).
//
// Felipe quiere seguir licitaciones que no va a postular ("la gira de
// estudio... me interesa saber quién se la ganó"). Mercado Público da en el
// detalle de cada licitación el enlace al acta (`Adjudicacion.UrlActa`), y
// esa página se abre sin código (revisado el 19-10 con la 3997-60-LE26).
// Trae, por ítem, TODAS las ofertas: proveedor y RUT, qué ofreció, a qué
// precio y si ganó. Se lee por los ids de cada campo, que son fijos
// (grdItemOC_ctlNN_ucAward_...), no por el diseño de la página.
//
// Los adjuntos de esa misma página sí piden código: esos no se bajan
// (se arrastran a mano, como las bases).

export type OfertaDelActa = {
  rut: string | null;
  proveedor: string;
  /** Lo que el proveedor escribió de su oferta. */
  detalle: string;
  /** Monto unitario ofertado, neto. */
  precio_unitario: number | null;
  cantidad_adjudicada: number;
  total_adjudicado: number;
  adjudicada: boolean;
};

export type ItemDelActa = {
  numero: number;
  producto: string;
  /** Lo que pidió el comprador en esa línea. */
  especificacion: string;
  cantidad: number | null;
  ofertas: OfertaDelActa[];
};

export type ActaDeAdjudicacion = {
  /** "15/10/2026 15:44": cuándo se informó en el portal. */
  informada: string | null;
  monto_adjudicado: number | null;
  items: ItemDelActa[];
};

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodificar = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e: string) => {
    if (e[0] === '#') {
      const codigo =
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : todo;
    }
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });

export const limpio = (html: string): string =>
  decodificar(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** "7.050.420" o "$ 1176471" → número; null si no hay dígitos. */
export const monto = (s: string): number | null => {
  const digitos = s.replace(/[^\d,]/g, '').replace(',', '.');
  if (!digitos) return null;
  const n = Number(digitos);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Los textos de un campo del acta, por su id: [item, oferta?] → texto. */
const campos = (
  html: string,
  patron: string,
): Array<{ item: string; oferta: string | null; texto: string }> =>
  [
    ...html.matchAll(
      new RegExp(`<span[^>]*id="${patron}"[^>]*>([\\s\\S]*?)</span>`, 'g'),
    ),
  ].map((m) => ({
    item: m[1],
    oferta: m.length > 3 ? m[2] : null,
    texto: limpio(m[m.length - 1]),
  }));

const DEL_ITEM = (campo: string) => `grdItemOC_(ctl\\d+)_ucAward_${campo}`;
const DE_LA_OFERTA = (campo: string) =>
  `grdItemOC_(ctl\\d+)_ucAward_gvLines_(ctl\\d+)_(?:gvLines_)?${campo}`;

/** Lee el acta (su HTML) y devuelve sus ítems con todas las ofertas. */
export function leerActa(html: string): ActaDeAdjudicacion {
  const items = new Map<string, ItemDelActa>();
  const item = (clave: string): ItemDelActa => {
    if (!items.has(clave)) {
      items.set(clave, {
        numero: items.size + 1,
        producto: '',
        especificacion: '',
        cantidad: null,
        ofertas: [],
      });
    }
    return items.get(clave)!;
  };
  for (const c of campos(html, DEL_ITEM('_lblNumber'))) {
    item(c.item).numero = monto(c.texto) ?? item(c.item).numero;
  }
  for (const c of campos(html, DEL_ITEM('_LblSchemaTittle'))) {
    item(c.item).producto = c.texto;
  }
  for (const c of campos(html, DEL_ITEM('lblDescription'))) {
    item(c.item).especificacion = c.texto;
  }
  for (const c of campos(html, DEL_ITEM('_LblRBICuantityNumber'))) {
    item(c.item).cantidad = monto(c.texto);
  }

  const ofertas = new Map<string, OfertaDelActa & { item: string }>();
  const oferta = (it: string, of: string) => {
    const clave = `${it}/${of}`;
    if (!ofertas.has(clave)) {
      ofertas.set(clave, {
        item: it,
        rut: null,
        proveedor: '',
        detalle: '',
        precio_unitario: null,
        cantidad_adjudicada: 0,
        total_adjudicado: 0,
        adjudicada: false,
      });
    }
    return ofertas.get(clave)!;
  };
  for (const c of campos(html, DE_LA_OFERTA('lblOrganization'))) {
    const o = oferta(c.item, c.oferta!);
    const conRut = /^([\d.]+-[\dkK])\s+(.*)$/.exec(c.texto);
    o.rut = conRut ? conRut[1] : null;
    o.proveedor = conRut ? conRut[2] : c.texto;
  }
  for (const c of campos(html, DE_LA_OFERTA('lblSupplierComment'))) {
    oferta(c.item, c.oferta!).detalle = c.texto;
  }
  for (const c of campos(html, DE_LA_OFERTA('lblTotalNetPrice'))) {
    oferta(c.item, c.oferta!).precio_unitario = monto(c.texto);
  }
  for (const c of campos(html, DE_LA_OFERTA('txtAwardedQuantity'))) {
    oferta(c.item, c.oferta!).cantidad_adjudicada = monto(c.texto) ?? 0;
  }
  for (const c of campos(html, DE_LA_OFERTA('lblTotalNetAward'))) {
    oferta(c.item, c.oferta!).total_adjudicado = monto(c.texto) ?? 0;
  }
  for (const c of campos(html, DE_LA_OFERTA('lblIsSelected'))) {
    oferta(c.item, c.oferta!).adjudicada = /^adjudicad/i.test(c.texto);
  }
  for (const { item: it, ...o } of ofertas.values()) {
    if (o.proveedor) item(it).ofertas.push(o);
  }

  const todo = limpio(html);
  return {
    informada:
      /Informada en portal el\s*(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2})/i.exec(
        todo,
      )?.[1] ?? null,
    monto_adjudicado: monto(
      /Monto Neto Adjudicado\s*\$\s*([\d.,]+)/i.exec(todo)?.[1] ?? '',
    ),
    items: [...items.values()].filter(
      (i) => i.producto || i.ofertas.length > 0,
    ),
  };
}

/** Solo el acta de Mercado Público: el enlace viene de su API, pero igual
 *  se revisa antes de ir a buscarlo. */
export const ENLACE_DEL_ACTA =
  /^https?:\/\/www\.mercadopublico\.cl\/Procurement\/Modules\/RFB\/StepsProcessAward\/PreviewAwardAct\.aspx\?qs=[\w%=+/-]+$/i;

export async function bajarActa(enlace: string): Promise<string> {
  if (!ENLACE_DEL_ACTA.test(enlace)) {
    throw new Error('el enlace del acta no es de Mercado Público');
  }
  const respuesta = await fetch(enlace, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Eventia; acta pública)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!respuesta.ok) throw new Error(`el acta respondió ${respuesta.status}`);
  return respuesta.text();
}
