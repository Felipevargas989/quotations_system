/**
 * EL NOMBRE DEL PDF (doc 19 §9.35). Felipe, 08-11: *"cuando descargo la
 * factura el nombre puede ser FXXXXX_ CLIENTE _ NRO COTIZACIÓN_OC SI
 * TIENE"*. Queda «F383_Municipalidad de Quillón_460_1213301-49-AG26»: la
 * letra del documento con su folio, el cliente como está en Eventia, el N°
 * de la cotización y la OC si tiene. Lo que falta no se pone.
 */

const LETRA: Record<number, string> = { 33: 'F', 39: 'B', 56: 'ND', 61: 'NC' };

export interface DatosDelNombre {
  tipo: number;
  folio: number | null;
  /** El cliente como está en Eventia (más corto que la razón social). */
  cliente: string | null;
  /** El N° de la cotización. */
  cotizacion: number | null;
  oc: string | null;
}

/** Sin lo que un nombre de archivo no admite. */
const parte = (texto: string | null, largo: number) =>
  // eslint-disable-next-line no-control-regex
  Array.from((texto ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' '))
    .slice(0, largo)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

export const nombreDelPdf = (d: DatosDelNombre): string =>
  [
    `${LETRA[d.tipo] ?? 'DTE'}${d.folio ?? 'sn'}`,
    parte(d.cliente, 60),
    d.cotizacion != null ? String(d.cotizacion) : '',
    parte(d.oc, 40),
  ]
    .filter(Boolean)
    .join('_');

/** El mismo nombre para el balde: sin tildes, espacios ni signos raros. */
export const nombreParaElBalde = (nombre: string): string =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

/** Lo que trae un documento de la base para su nombre: el cliente de
 *  Eventia y, si no, la razón social o la cabaña de la boleta. */
export interface DocumentoConSuNombre {
  tipo: number;
  folio: number | null;
  receptor?: { razon_social?: string | null } | null;
  detalle?: unknown;
  cotizacion?: {
    quotation_number: number;
    cliente?: { name: string | null } | null;
  } | null;
  oc?: { numero: string } | null;
}

export const nombreDelPdfDe = (d: DocumentoConSuNombre): string =>
  nombreDelPdf({
    tipo: d.tipo,
    folio: d.folio,
    cliente:
      d.cotizacion?.cliente?.name ??
      d.receptor?.razon_social ??
      (Array.isArray(d.detalle)
        ? ((d.detalle[0] as { cabana?: string | null } | undefined)?.cabana ??
          null)
        : null),
    cotizacion: d.cotizacion?.quotation_number ?? null,
    oc: d.oc?.numero ?? null,
  });

const NOMBRE_EN_EL_EVENTO: Record<number, string> = {
  33: 'Factura',
  34: 'Factura exenta',
  39: 'Boleta',
  56: 'Nota de débito',
  61: 'Nota de crédito',
};
const QUE_HACE_LA_NOTA: Record<number, string> = {
  1: 'anula',
  2: 'corrige',
  3: 'rebaja',
};
const DOCUMENTOS = new Set(['33', '34', '39', '56', '61']);

/**
 * EL NOMBRE EN DOCUMENTOS DEL EVENTO (doc 19 §9.39). Felipe, 08-11, con
 * las de Santo Tomás: *"cuando guardes las facturas en el evento le puedes
 * poner algún nombre [...] puede ser quizás el número de la factura y el
 * monto facturado"*. Post-Venta muestra el nombre solo si no termina en
 * «.pdf» (uno así es el nombre del archivo, no un comentario), y estos lo
 * terminaban: se veía solo la fecha. Queda «Factura N° 386 · $2.805.800» o
 * «Nota de crédito N° 116 · $2.805.780 · anula la 377».
 */
export const nombreEnElEvento = (d: {
  tipo: number;
  folio: number | null;
  total: number;
  referencias?: unknown[] | null;
}): string => {
  const monto = Math.round(Number(d.total) || 0).toLocaleString('es-CL');
  const base = `${NOMBRE_EN_EL_EVENTO[d.tipo] ?? 'Documento'} N° ${d.folio ?? 's/n'} · $${monto}`;
  if (d.tipo !== 56 && d.tipo !== 61) return base;
  const ref = (d.referencias ?? []).find(
    (r): r is { tipo: string; folio: string; codigo?: number } =>
      !!r &&
      typeof r === 'object' &&
      DOCUMENTOS.has(String((r as { tipo?: unknown }).tipo)),
  );
  return ref
    ? `${base} · ${QUE_HACE_LA_NOTA[ref.codigo ?? 0] ?? 'modifica'} la ${ref.folio}`
    : base;
};
