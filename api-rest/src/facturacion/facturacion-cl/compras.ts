import { desescapar, type CredencialesDeFacturacionCl } from './soap';

/**
 * EL LIBRO DE COMPRAS DE FACTURACION.CL (doc 19 §9.25 y §9.28).
 *
 * Felipe, 07-11: *"¿ya trajiste las facturas recibidas? ¿eso funcionará?"*.
 * Lo recibido no está en el manual de integración, sino en el «Manual
 * WebService de Compras» (`manualintegracion/archivomanualwscompras.php`):
 * un servicio SOAP aparte, en Java (JAX-WS), con su propia dirección.
 * Medido el 08-11 en su definición pública (`Compra?wsdl` y `?xsd=1`):
 *
 * - `obtenerCompra` (espacio `http://api.facturacion.com/`, sin SOAPAction):
 *   `login` (`Rut` y `Clave`, en Base64 como el resto de facturacion.cl),
 *   `periodo` AAAA-MM obligatorio, y opcionales `rutEmisor`, `tipoDTE`,
 *   `folio`, `FormaPago`, `FechaIngreso`, `IncluyeLink` = 1 (el enlace del
 *   PDF cedible) y `ConXML` = 1 (solo los que llegaron con su XML);
 * - responde `return` → `WSPLANO` → `Resultado`, `Mensaje` y `Detalle` →
 *   un `Documento` por cada uno: su `XML`, el `RCV` (`recepcionSII`,
 *   `acuseSII`, `tipoCompra`) y el `LinkPDF`.
 *
 * El manual no dice si cuesta aparte (`ConsultaLibroVentas` sí). Se sabe
 * probando en producción: el laboratorio solo tiene la empresa de prueba.
 */

export const URL_DEL_LIBRO_DE_COMPRAS =
  'https://api.facturacion.com:443/WSFacturacion/Compra';
const ESPACIO = 'http://api.facturacion.com/';

const base64 = (texto: string) => Buffer.from(texto, 'utf8').toString('base64');

/** Un documento del libro de compras, como lo entrega facturacion.cl. */
export interface DocumentoDelLibro {
  /** El XML del DTE, ya decodificado (nulo si no vino). */
  xml: string | null;
  linkPdf: string | null;
  recepcionSii: string | null;
  acuseSii: string | null;
  tipoCompra: number | null;
}

export interface RespuestaDelLibro {
  ok: boolean;
  mensaje: string | null;
  documentos: DocumentoDelLibro[];
}

/** Lo que importa de un DTE recibido, leído de su XML. */
export interface DatosDelRecibido {
  tipo: number;
  folio: number;
  fecha_emision: string | null;
  rut_emisor: string;
  razon_social_emisor: string | null;
  neto: number | null;
  exento: number | null;
  iva: number | null;
  total: number | null;
}

/** El contenido de la primera etiqueta con ese nombre (con o sin prefijo). */
const etiqueta = (xml: string, nombre: string): string | null => {
  const m = new RegExp(
    `<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`,
  ).exec(xml);
  return m ? desescapar(m[1]).trim() : null;
};

/** Todas las apariciones de una etiqueta (con o sin prefijo). */
const todas = (xml: string, nombre: string): string[] => {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`,
    'g',
  );
  return [...xml.matchAll(re)].map((m) => m[1]);
};

/**
 * El XML del DTE como viene en la respuesta: escapado dentro del sobre, o en
 * Base64 (el manual dice «base64Binary»). Si el XML declara ISO-8859-1 (el
 * formato del SII), se lee así.
 */
export const xmlDelDocumento = (crudo: string | null): string | null => {
  if (!crudo) return null;
  const texto = desescapar(crudo).trim();
  if (!texto) return null;
  if (texto.startsWith('<')) return texto;
  const bytes = Buffer.from(texto.replace(/\s+/g, ''), 'base64');
  const cabeza = bytes.subarray(0, 200).toString('latin1');
  const latin = /encoding=["']ISO-8859-1["']/i.test(cabeza);
  const xml = bytes.toString(latin ? 'latin1' : 'utf8').trim();
  return xml.startsWith('<') ? xml : null;
};

/** La respuesta de `obtenerCompra`, con tolerancia (como el resto). */
export const leerRespuestaDelLibro = (texto: string): RespuestaDelLibro => {
  // Un XML dentro de CDATA traería sus propias etiquetas `Documento`: se
  // escapa primero, para que solo cuenten las del sobre.
  const plano = texto.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) =>
    c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  );
  const resultado = etiqueta(plano, 'Resultado');
  const mensaje = etiqueta(plano, 'Mensaje');
  const documentos = todas(plano, 'Documento').map((d) => {
    const tipoCompra = Number(etiqueta(d, 'tipoCompra'));
    return {
      xml: xmlDelDocumento(etiqueta(d, 'XML')),
      linkPdf: etiqueta(d, 'LinkPDF') || null,
      recepcionSii: etiqueta(d, 'recepcionSII') || null,
      acuseSii: etiqueta(d, 'acuseSII') || null,
      tipoCompra: Number.isFinite(tipoCompra) && tipoCompra ? tipoCompra : null,
    };
  });
  return {
    ok: resultado?.toLowerCase() === 'true',
    mensaje: mensaje || null,
    documentos,
  };
};

const numero = (valor: string | null): number | null => {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Lo que importa del DTE: quién lo emite, qué es, cuándo y por cuánto. */
export const datosDelRecibido = (xml: string): DatosDelRecibido | null => {
  // El primer documento (un EnvioDTE puede traer varios; acá viene uno).
  const documento = etiqueta(xml, 'Documento') ?? xml;
  const encabezado = etiqueta(documento, 'Encabezado') ?? documento;
  const tipo = numero(etiqueta(encabezado, 'TipoDTE'));
  const folio = numero(etiqueta(encabezado, 'Folio'));
  const emisor = etiqueta(encabezado, 'Emisor') ?? encabezado;
  const rut = etiqueta(emisor, 'RUTEmisor');
  if (!tipo || !folio || !rut) return null;
  const totales = etiqueta(encabezado, 'Totales') ?? encabezado;
  return {
    tipo,
    folio,
    fecha_emision: etiqueta(encabezado, 'FchEmis'),
    rut_emisor: rut.replace(/\./g, '').toUpperCase(),
    razon_social_emisor:
      etiqueta(emisor, 'RznSoc') ?? etiqueta(emisor, 'RznSocEmisor'),
    neto: numero(etiqueta(totales, 'MntNeto')),
    exento: numero(etiqueta(totales, 'MntExe')),
    iva: numero(etiqueta(totales, 'IVA')),
    total: numero(etiqueta(totales, 'MntTotal')),
  };
};

/** El sobre de `obtenerCompra` (sin SOAPAction; hijos sin calificar). */
export const sobreDelLibro = (
  credenciales: CredencialesDeFacturacionCl,
  periodo: string,
  conLink: boolean,
): string =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"' +
  ` xmlns:api="${ESPACIO}"><soap:Body><api:obtenerCompra>` +
  `<login><Rut>${base64(credenciales.rut.replace(/[.\s]/g, ''))}</Rut>` +
  `<Clave>${base64(credenciales.clave)}</Clave></login>` +
  `<periodo>${periodo}</periodo>` +
  (conLink ? '<IncluyeLink>1</IncluyeLink>' : '') +
  '</api:obtenerCompra></soap:Body></soap:Envelope>';

/**
 * El cliente del Libro de Compras. Solo lee: no acepta ni rechaza nada (el
 * acuse es el paso 3 de §9.25, con otro OK de Felipe). Ni las credenciales
 * ni el sobre van a un error.
 */
export class FacturacionClCompras {
  constructor(
    private readonly opciones: {
      credenciales: CredencialesDeFacturacionCl;
      url?: string;
      /** Solo para las pruebas. */
      fetch?: typeof fetch;
      espera?: number;
    },
  ) {}

  async obtenerCompra(
    periodo: string,
    { conLink = true }: { conLink?: boolean } = {},
  ): Promise<RespuestaDelLibro> {
    const llamar = this.opciones.fetch ?? fetch;
    let respuesta: Response;
    try {
      respuesta = await llamar(this.opciones.url ?? URL_DEL_LIBRO_DE_COMPRAS, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '""',
        },
        body: sobreDelLibro(this.opciones.credenciales, periodo, conLink),
        signal: AbortSignal.timeout(this.opciones.espera ?? 120_000),
      });
    } catch {
      throw new Error(
        'facturacion.cl no respondió al pedir el libro de compras',
      );
    }
    const texto = await respuesta.text();
    if (!respuesta.ok) {
      const falla =
        etiqueta(texto, 'faultstring') ?? etiqueta(texto, 'message');
      throw new Error(
        `facturacion.cl respondió ${respuesta.status} al pedir el libro de compras${falla ? `: ${falla}` : ''}`,
      );
    }
    return leerRespuestaDelLibro(texto);
  }
}
