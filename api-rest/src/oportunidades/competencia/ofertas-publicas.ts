// LAS OFERTAS DE LA COMPETENCIA, DESDE MERCADO PÚBLICO (decisión 96 del doc
// 17, 27-10). Felipe: "si yo no las cargué, que tú lo trajeras una vez que
// la gané o perdí y obtener un feedback del porqué". El «Resumen de ofertas»
// de una licitación es público: cada oferente con su RUT, su total y sus
// anexos (administrativos, técnicos y económicos). Cada archivo se baja uno
// por uno, sin clave ni cookie, con el botón «Ver anexo» de su fila; bajar
// todos juntos pide un código de imagen, y ese camino no se usa. Medido el
// 27-10 con la 4364-13-LE26 (Día del Profesor): Sol de Quillón, 3 páginas
// de anexos administrativos.

const BASE = 'https://www.mercadopublico.cl';
const AGENTE = 'Mozilla/5.0 (Eventia; ofertas públicas)';
const CODIGO_DE_LICITACION = /^\d+-\d+-[A-Z0-9]+$/i;
/** Solo se siguen enlaces de Mercado Público con esta forma. */
const DEL_CUADRO =
  /^\/Procurement\/Modules\/RFB\/StepsProcessAward\/OpeningFrame\.aspx\?enc=[\w%=+/.-]+$/;
const DEL_RESUMEN = /^[\w%=+/.-]+$/;
const DEL_ANEXO =
  /^\/BID\/Modules\/POPUPS\/ViewBidAttachment\.aspx\?enc=[\w%=+/.-]+$/;
/** Por anexo: la lista va de a 6 archivos por página. */
const MAX_PAGINAS = 20;

export type TipoDeAnexo = 'administrativos' | 'tecnicos' | 'economicos';

export type OfertaPublica = {
  rut: string;
  proveedor: string;
  /** El total de la oferta, en pesos. */
  total: number | null;
  /** «Aceptada», «Rechazada»… */
  estado: string | null;
  /** La página de cada tipo de anexo que trae. */
  anexos: Partial<Record<TipoDeAnexo, string>>;
};

export type ArchivoDelAnexo = {
  nombre: string;
  /** Lo que dice la lista, en KB; null si no lo dice. */
  kb: number | null;
  boton: string;
};

export type PaginaDelAnexo = {
  archivos: ArchivoDelAnexo[];
  /** Los campos ocultos del formulario: se devuelven en cada pedido. */
  ocultos: Record<string, string>;
  /** Las otras páginas de la lista («Page$2»…). */
  paginas: string[];
};

export type Pedir = (url: string, init?: RequestInit) => Promise<Response>;

const TIPO: Record<string, TipoDeAnexo> = {
  Administrative: 'administrativos',
  Technical: 'tecnicos',
  Economic: 'economicos',
};

const desescapar = (s: string): string =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

const pesos = (texto: string | null): number | null => {
  const n = Number((texto ?? '').replace(/[^\d]/g, ''));
  return texto && Number.isFinite(n) && n > 0 ? n : null;
};

/** La página del cuadro de ofertas, desde la ficha; null si todavía no
 *  hay apertura. */
export const enlaceDelCuadro = (ficha: string): string | null => {
  const m = /id="imgCuadroOferta"[^>]*\shref="([^"]+)"/.exec(ficha);
  const ruta = m ? desescapar(m[1]) : null;
  return ruta && DEL_CUADRO.test(ruta) ? `${BASE}${ruta}` : null;
};

/** El «Resumen de ofertas», desde la cabecera del cuadro. */
export const enlaceDelResumen = (cabecera: string): string | null => {
  const m = /SupplySummary\.aspx\?enc=([^&'"\s]+)/.exec(cabecera);
  return m && DEL_RESUMEN.test(m[1])
    ? `${BASE}/Procurement/Modules/RFB/StepsProcessAward/SupplySummary.aspx?enc=${m[1]}`
    : null;
};

/** Cada oferente del resumen, por la fila de la grilla (`ctl02`, `ctl03`…). */
export const ofertasDelResumen = (resumen: string): OfertaPublica[] => {
  const filas = [
    ...new Set(
      [...resumen.matchAll(/id="grdSupplies_ctl(\d+)__GvLblRutProvider"/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  return filas.flatMap((n): OfertaPublica[] => {
    const texto = (campo: string) => {
      const m = new RegExp(
        `id="grdSupplies_ctl${n}_${campo}"[^>]*>([^<]*)<`,
      ).exec(resumen);
      return m ? desescapar(m[1]).trim() || null : null;
    };
    const rut = texto('_GvLblRutProvider');
    if (!rut) return [];
    const anexos: OfertaPublica['anexos'] = {};
    const botones = new RegExp(
      `id="grdSupplies_ctl${n}__GvImgb(Administrative|Technical|Economic)Attachment"[^>]*onclick="openPopUp\\(&#39;([^&]+)&#39;`,
      'g',
    );
    for (const [, tipo, ruta] of resumen.matchAll(botones)) {
      const limpia = desescapar(ruta);
      if (DEL_ANEXO.test(limpia)) anexos[TIPO[tipo]] = `${BASE}${limpia}`;
    }
    return [
      {
        rut,
        proveedor: texto('_GvLblProvider') ?? rut,
        total: pesos(texto('TotalOferta')),
        estado: texto('EstadoOferta'),
        anexos,
      },
    ];
  });
};

/** Una página de la lista de archivos de un anexo. */
export const leerPaginaDelAnexo = (pagina: string): PaginaDelAnexo => {
  const ocultos: Record<string, string> = {};
  for (const [, nombre, valor] of pagina.matchAll(
    /<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g,
  )) {
    ocultos[nombre] = desescapar(valor);
  }
  const archivos: ArchivoDelAnexo[] = [];
  for (const [, n, nombre] of pagina.matchAll(
    /id="DWNL_grdId_ctl(\d+)_File">([^<]*)</g,
  )) {
    const kb = new RegExp(
      `id="DWNL_grdId_ctl${n}_FileLength">([\\d.,]+)\\s*KB`,
    ).exec(pagina);
    archivos.push({
      nombre: desescapar(nombre).trim(),
      kb: kb ? Number(kb[1].replace(/[.,]/g, '')) : null,
      boton: `DWNL$grdId$ctl${n}$search`,
    });
  }
  const paginas = [
    ...new Set(
      [
        ...pagina.matchAll(
          /__doPostBack\(&#39;DWNL\$grdId&#39;,&#39;(Page\$\d+)&#39;\)/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  return { archivos, ocultos, paginas };
};

/** El nombre que manda Mercado Público: viene en UTF-8, y fetch lo entrega
 *  leído como latin1. */
export const nombreDelArchivo = (disposicion: string | null): string | null => {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicion ?? '');
  if (!m) return null;
  const crudo = m[1].trim();
  const utf8 = Buffer.from(crudo, 'latin1').toString('utf8');
  return (utf8.includes('�') ? crudo : utf8).replace(/_/g, ' ');
};

export const pedirPublico: Pedir = (url, init) =>
  fetch(url, {
    ...init,
    headers: { 'User-Agent': AGENTE, ...(init?.headers ?? {}) },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });

const texto = async (pedir: Pedir, url: string, cuerpo?: URLSearchParams) => {
  const r = await pedir(
    url,
    cuerpo
      ? {
          method: 'POST',
          body: cuerpo,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      : undefined,
  );
  if (!r.ok) throw new Error(`Mercado Público respondió ${r.status}`);
  return r.text();
};

/** Los oferentes de una licitación, del «Resumen de ofertas» público;
 *  vacío si todavía no hay apertura. */
export async function ofertasDeLaLicitacion(
  codigo: string,
  pedir: Pedir = pedirPublico,
): Promise<OfertaPublica[]> {
  if (!CODIGO_DE_LICITACION.test(codigo)) return [];
  const ficha = await texto(
    pedir,
    `${BASE}/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(codigo)}`,
  );
  const cuadro = enlaceDelCuadro(ficha);
  if (!cuadro) return [];
  const cabecera = await texto(
    pedir,
    cuadro.replace('OpeningFrame.aspx', 'OpeningHeader.aspx'),
  );
  const resumen = enlaceDelResumen(cabecera);
  return resumen ? ofertasDelResumen(await texto(pedir, resumen)) : [];
}

/** Los archivos de un anexo, uno por uno, página por página. `aceptar`
 *  decide por el nombre y el tamaño de la lista, antes de bajarlo. */
export async function* archivosDelAnexo(
  url: string,
  aceptar: (a: ArchivoDelAnexo) => boolean,
  pedir: Pedir = pedirPublico,
): AsyncGenerator<{ nombre: string; contenido: Buffer }> {
  if (!DEL_ANEXO.test(url.replace(BASE, ''))) return;
  let pagina = leerPaginaDelAnexo(await texto(pedir, url));
  // Se parte en la 1; en la 2, el paginador ofrece la 1 y la 3.
  const vistas = new Set<string>(['Page$1']);
  for (let vuelta = 0; vuelta < MAX_PAGINAS; vuelta++) {
    for (const a of pagina.archivos) {
      if (!aceptar(a)) continue;
      const cuerpo = new URLSearchParams(pagina.ocultos);
      cuerpo.set(`${a.boton}.x`, '5');
      cuerpo.set(`${a.boton}.y`, '5');
      const r = await pedir(url, {
        method: 'POST',
        body: cuerpo,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const disposicion = r.headers.get('content-disposition');
      if (!r.ok || !/attachment/i.test(disposicion ?? '')) continue;
      yield {
        nombre: nombreDelArchivo(disposicion) ?? a.nombre,
        contenido: Buffer.from(await r.arrayBuffer()),
      };
    }
    const siguiente = pagina.paginas.find((p) => !vistas.has(p));
    if (!siguiente) return;
    vistas.add(siguiente);
    const cuerpo = new URLSearchParams(pagina.ocultos);
    cuerpo.set('__EVENTTARGET', 'DWNL$grdId');
    cuerpo.set('__EVENTARGUMENT', siguiente);
    pagina = leerPaginaDelAnexo(await texto(pedir, url, cuerpo));
  }
}
