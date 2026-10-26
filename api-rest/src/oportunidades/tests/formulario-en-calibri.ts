import { zipCon } from './zip-de-prueba';

// UN FORMULARIO COMO EL N°5 DE LA 5040-14-LE26 (decisión 82): la base del
// documento es Times New Roman 12 y el texto del municipio dice su letra,
// Calibri 11, corrida por corrida. Lo que escribe la IA va sin letra. Para
// las pruebas de la letra del formulario, del editor y de la generación.

export const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export const CALIBRI =
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';

/** Texto del municipio: Calibri 11, más lo que se pida (`<w:b/>`). */
export const enCalibri = (t: string, mas = '') =>
  `<w:r><w:rPr>${CALIBRI}${mas}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;

/** Texto sin letra propia, como lo escribe la IA. */
export const sinLetra = (t: string, rPr = '') =>
  `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>`;

export const BASE_TIMES = `<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titulo"><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Enfasis"><w:rPr><w:i/></w:rPr></w:style>
</w:styles>`;

/** Una fila: cada celda con un párrafo y lo que se le dé adentro. */
export const fila = (...celdas: string[]) =>
  `<w:tr>${celdas.map((c) => `<w:tc><w:p>${c}</w:p></w:tc>`).join('')}</w:tr>`;

export const tabla = (...filas: string[]) =>
  `<w:tbl><w:tblPr/>${filas.join('')}</w:tbl>`;

export const formularioCon = (
  cuerpo: string,
  estilos = BASE_TIMES,
  otros: Array<[string, string]> = [],
): Buffer =>
  zipCon([
    ['[Content_Types].xml', '<Types/>'],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${cuerpo}</w:body></w:document>`,
    ],
    ['word/styles.xml', estilos],
    ...otros,
  ]);
