import { armarZip } from './zip';

// EL WORD EN EL FORMATO DE LA CASA (decisión 119 del doc 17, 07-11; Felipe,
// con la muestra de la cotización N° 574: "Sí, me gusta, déjalo como
// regla"). La cara de la cotización que Eventia manda a los clientes: el
// logo arriba, el título y el de cada parte en mayúsculas espaciadas y del
// color principal de la marca, los rótulos grises en mayúsculas y los
// bordes gris claro. Lo usan la cotización detallada
// (`la-cotizacion-detallada.ts`) y, desde la parte 3b (08-11), las
// declaraciones (`las-declaraciones.ts`). El Word se arma a mano, como el
// ZIP (`armarZip`).

export const LETRA = 'Calibri';
const BORDE = 'D1D5DB';
export const GRIS = '6B7280';
export const BLANCO = 'FFFFFF';
/** Sin colores de la marca en Configuración de empresa: grises sobrios. */
export const SIN_MARCA = { primario: '1F2937', secundario: 'F3F4F6' };
/** El ancho del texto de la hoja, en veinteavos de punto. */
export const ANCHO = 9972;
export const A_DATOS = [2900, ANCHO - 2900];
const EMU_POR_CM = 360000;

const xml = (t: string): string =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

type Estilo = {
  negrita?: boolean;
  tam?: number;
  color?: string;
  mayus?: boolean;
  /** Entre letras, en veinteavos de punto: los rótulos de la casa. */
  espaciado?: number;
};

export const corrida = (t: string, e: Estilo = {}): string => {
  const tam = e.tam ?? 22;
  const partes = t
    .split('\n')
    .map(
      (p, i) =>
        `${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(p)}</w:t>`,
    )
    .join('');
  // En el orden del esquema de Word: rFonts, b, caps, color, spacing, sz.
  return `<w:r><w:rPr><w:rFonts w:ascii="${LETRA}" w:hAnsi="${LETRA}" w:cs="${LETRA}"/>${e.negrita ? '<w:b/>' : ''}${e.mayus ? '<w:caps/>' : ''}${e.color ? `<w:color w:val="${e.color}"/>` : ''}${e.espaciado ? `<w:spacing w:val="${e.espaciado}"/>` : ''}<w:sz w:val="${tam}"/><w:szCs w:val="${tam}"/></w:rPr>${partes}</w:r>`;
};

type Parrafo = {
  alineado?: 'left' | 'center' | 'right' | 'both';
  antes?: number;
  despues?: number;
  /** Con el siguiente y sin partirse: la firma no queda sola. */
  junto?: boolean;
};

export const parrafo = (contenido: string, p: Parrafo = {}): string =>
  `<w:p><w:pPr>${p.junto ? '<w:keepNext/><w:keepLines/>' : ''}<w:spacing w:before="${p.antes ?? 0}" w:after="${p.despues ?? 80}"/><w:jc w:val="${p.alineado ?? 'left'}"/></w:pPr>${contenido}</w:p>`;

type Celda = Omit<Estilo, 'negrita'> & {
  ancho: number;
  negrita?: boolean;
  alineado?: 'left' | 'center' | 'right';
  juntas?: number;
  fondo?: string;
};

export const celda = (t: string, c: Celda): string =>
  `<w:tc><w:tcPr><w:tcW w:w="${c.ancho}" w:type="dxa"/>${c.juntas && c.juntas > 1 ? `<w:gridSpan w:val="${c.juntas}"/>` : ''}${c.fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fondo}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${parrafo(corrida(t, c), { alineado: c.alineado, despues: 0 })}</w:tc>`;

export const fila = (...celdas: string[]): string =>
  `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdas.join('')}</w:tr>`;

export const tabla = (anchos: number[], filasDeLaTabla: string[]): string => {
  const bordes = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(
      (l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="${BORDE}"/>`,
    )
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${anchos.reduce((s, a) => s + a, 0)}" w:type="dxa"/><w:tblBorders>${bordes}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${a}"/>`).join('')}</w:tblGrid>${filasDeLaTabla.join('')}</w:tbl>`;
};

/** El título de cada parte, como los de la cotización de Eventia: chico,
 *  en mayúsculas espaciadas y del color de la marca. */
export const titulo = (t: string, color: string): string =>
  parrafo(
    corrida(t, { negrita: true, tam: 21, color, mayus: true, espaciado: 24 }),
    { antes: 240, despues: 100, junto: true },
  );

/** Rótulo gris en mayúsculas y el dato al lado. */
export const deDatos = (pares: Array<[string, string]>): string =>
  tabla(
    A_DATOS,
    pares.map(([k, v]) =>
      fila(
        celda(k, {
          ancho: A_DATOS[0],
          negrita: true,
          tam: 17,
          color: GRIS,
          mayus: true,
          espaciado: 10,
        }),
        celda(v, { ancho: A_DATOS[1] }),
      ),
    ),
  );

/** La línea y el nombre del que firma, al final. */
export const laFirma = (lineas: string): string[] => [
  parrafo(corrida('______________________________'), {
    antes: 720,
    despues: 0,
    junto: true,
  }),
  parrafo(corrida(lineas), { despues: 0 }),
];

/** El ancho y el alto de un PNG o un JPG, para no deformar el logo. */
export const medidasDeLaImagen = (
  datos: Buffer,
): { ancho: number; alto: number; tipo: 'png' | 'jpeg' } | null => {
  if (
    datos.length > 24 &&
    datos.readUInt32BE(0) === 0x89504e47 &&
    datos.toString('ascii', 12, 16) === 'IHDR'
  ) {
    return {
      ancho: datos.readUInt32BE(16),
      alto: datos.readUInt32BE(20),
      tipo: 'png',
    };
  }
  if (datos.length > 4 && datos[0] === 0xff && datos[1] === 0xd8) {
    let i = 2;
    while (i + 9 < datos.length) {
      if (datos[i] !== 0xff) return null;
      const marca = datos[i + 1];
      const largo = datos.readUInt16BE(i + 2);
      // SOF0 a SOF15, sin DHT (C4), JPG (C8) ni DAC (CC).
      if (
        marca >= 0xc0 &&
        marca <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marca)
      ) {
        return {
          alto: datos.readUInt16BE(i + 5),
          ancho: datos.readUInt16BE(i + 7),
          tipo: 'jpeg',
        };
      }
      i += 2 + largo;
    }
  }
  return null;
};

const logoEnLinea = (alto: number, ancho: number): string =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${ancho}" cy="${alto}"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${ancho}" cy="${alto}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP =
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

export type LogoDelWord = { datos: Buffer; tipo: 'png' | 'jpeg' };

/** El Word entero: el logo arriba (si hay) y el cuerpo. */
export function empaquetarElWord(
  cuerpo: string[],
  logoDeLaEmpresa?: LogoDelWord | null,
): Buffer {
  const medidas = logoDeLaEmpresa
    ? medidasDeLaImagen(logoDeLaEmpresa.datos)
    : null;
  // El logo, de 1,6 cm de alto y a lo más 6 cm de ancho, sin deformarlo.
  let logo = '';
  if (medidas && medidas.ancho > 0 && medidas.alto > 0) {
    let alto = 1.6 * EMU_POR_CM;
    let ancho = (alto * medidas.ancho) / medidas.alto;
    if (ancho > 6 * EMU_POR_CM) {
      ancho = 6 * EMU_POR_CM;
      alto = (ancho * medidas.alto) / medidas.ancho;
    }
    logo = logoEnLinea(Math.round(alto), Math.round(ancho));
  }
  const documento =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}"><w:body>${logo}${cuerpo.join('')}` +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const estilos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${LETRA}" w:hAnsi="${LETRA}" w:cs="${LETRA}" w:eastAsia="${LETRA}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const extension = medidas?.tipo === 'jpeg' ? 'jpeg' : 'png';
  const tipos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (logo
      ? `<Default Extension="${extension}" ContentType="image/${extension}"/>`
      : '') +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';
  const relaciones =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  const relacionesDelDocumento =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    (logo
      ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${extension}"/>`
      : '') +
    '</Relationships>';
  const texto = (nombre: string, contenido: string) => ({
    nombre,
    datos: Buffer.from(contenido, 'utf8'),
    comprimir: true,
  });
  return armarZip([
    texto('[Content_Types].xml', tipos),
    texto('_rels/.rels', relaciones),
    texto('word/document.xml', documento),
    texto('word/styles.xml', estilos),
    texto('word/_rels/document.xml.rels', relacionesDelDocumento),
    ...(logo && logoDeLaEmpresa
      ? [
          {
            nombre: `word/media/logo.${extension}`,
            datos: logoDeLaEmpresa.datos,
          },
        ]
      : []),
  ]);
}
