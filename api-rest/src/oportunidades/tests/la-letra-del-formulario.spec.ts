import { archivoDelZip, textoDeDocx } from '../analisis/docx';
import {
  leerElWord,
  type Parrafo,
  type Tabla,
  type Tramo,
} from '../postulacion/el-word-editable';
import {
  conLaLetraDelFormulario,
  LETRA_POR_DEFECTO,
} from '../postulacion/la-letra-del-formulario';
import {
  BASE_TIMES,
  CALIBRI,
  enCalibri,
  fila,
  formularioCon,
  sinLetra,
  tabla,
  W,
} from './formulario-en-calibri';

// LA LETRA DEL FORMULARIO MANDA (decisión 82): lo que la IA escribió sin
// letra toma la del texto con letra propia más cercano (su fila, su tabla)
// o la de la mayor parte del documento; Calibri solo cuando el Word no dice
// ninguna. Lo que pone el formulario no se toca.

const LARGO =
  'Presenta oferta económica, según el siguiente detalle: debe indicar valores unitarios de cada servicio';

const N5 = formularioCon(
  `<w:p>${enCalibri('OFERTA ECONÓMICA', '<w:b/>')}</w:p>` +
    `<w:p>${enCalibri(LARGO)}</w:p>` +
    tabla(
      fila(enCalibri('Almuerzo'), enCalibri('550'), sinLetra('$12.101')),
      fila(
        enCalibri('TOTAL GENERAL LÍNEA N°1', '<w:b/>'),
        enCalibri('Neto'),
        sinLetra('$14.411.765', '<w:rPr><w:i/></w:rPr>'),
      ),
    ) +
    `<w:p>${sinLetra('La oferta tiene vigencia de 60 días.')}</w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Titulo"/></w:pPr>${sinLetra('Anexo')}</w:p>` +
    `<w:p>${sinLetra('con estilo', '<w:rPr><w:rStyle w:val="Enfasis"/></w:rPr>')}</w:p>`,
);

/** Cómo se ve cada pedazo de texto, como lo muestra el editor. */
const comoSeVe = (docx: Buffer): Map<string, Tramo> => {
  const todos = new Map<string, Tramo>();
  const recorrer = (b: Parrafo | Tabla) => {
    if (b.tipo === 'parrafo') b.tramos.forEach((t) => todos.set(t.t, t));
    else b.filas.flat().forEach((c) => c.bloques.forEach(recorrer));
  };
  leerElWord(docx)?.bloques.forEach(recorrer);
  return todos;
};

const documentoDe = (docx: Buffer) =>
  archivoDelZip(docx, 'word/document.xml')?.toString('utf8') ?? '';

describe('conLaLetraDelFormulario — lo que la IA escribió sin letra', () => {
  const { docx, cambiadas } = conLaLetraDelFormulario(N5);
  const visto = comoSeVe(docx);

  it('en una celda, toma la letra y el tamaño de su fila', () => {
    expect(comoSeVe(N5).get('$12.101')).toMatchObject({
      f: 'Times New Roman',
      pt: 12,
    });
    expect(visto.get('$12.101')).toMatchObject({ f: 'Calibri', pt: 11 });
    expect(visto.get('$14.411.765')).toMatchObject({
      f: 'Calibri',
      pt: 11,
      i: true,
      b: false,
    });
    expect(cambiadas).toBe(3);
  });

  it('la letra va en su lugar: antes de la cursiva, y el tamaño después', () => {
    const xml = documentoDe(docx);
    expect(xml).toContain(
      `<w:r><w:rPr>${CALIBRI}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">$12.101</w:t></w:r>`,
    );
    expect(xml).toContain(
      `<w:r><w:rPr>${CALIBRI}<w:i/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">$14.411.765</w:t></w:r>`,
    );
  });

  it('fuera de una tabla, toma la letra de la mayor parte del documento', () => {
    expect(visto.get('La oferta tiene vigencia de 60 días.')).toMatchObject({
      f: 'Calibri',
      pt: 11,
    });
  });

  it('lo que pone el formulario no se toca: su texto, un título con su estilo y una corrida con estilo de carácter', () => {
    expect(visto.get('Anexo')).toMatchObject({ f: 'Arial', b: true });
    expect(visto.get('con estilo')).toMatchObject({
      f: 'Times New Roman',
      i: true,
    });
    const xml = documentoDe(docx);
    for (const t of ['Almuerzo', '550', 'Neto', LARGO]) {
      expect(xml).toContain(enCalibri(t));
    }
  });

  it('el texto no cambia ni una letra y el Word se vuelve a abrir', () => {
    expect(textoDeDocx(docx)).toBe(textoDeDocx(N5));
    expect(leerElWord(docx)).not.toBeNull();
  });
});

describe('conLaLetraDelFormulario — de dónde sale la letra', () => {
  it('un Word que no dice ninguna letra queda en Calibri', () => {
    const sinNinguna = formularioCon(
      `<w:p>${sinLetra('Razón social')}</w:p><w:p>${sinLetra('Valle del Sol')}</w:p>`,
      `<w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
    );
    const visto = comoSeVe(conLaLetraDelFormulario(sinNinguna).docx);
    expect(visto.get('Razón social')?.f).toBe(LETRA_POR_DEFECTO);
    expect(visto.get('Valle del Sol')?.f).toBe('Calibri');
  });

  it('un formulario que ya está todo en su letra queda igual: el mismo archivo', () => {
    const enArial = formularioCon(
      tabla(fila(sinLetra('Almuerzo'), sinLetra('$12.101'))),
      `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
    );
    const r = conLaLetraDelFormulario(enArial);
    expect(r.cambiadas).toBe(0);
    expect(r.docx).toBe(enArial);
  });

  it('la letra del tema se copia tal cual', () => {
    const TEMA =
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
    const DEL_TEMA =
      '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>';
    const conTema = formularioCon(
      tabla(
        fila(
          `<w:r><w:rPr>${DEL_TEMA}</w:rPr><w:t>Almuerzo</w:t></w:r>`,
          sinLetra('$12.101'),
        ),
      ),
      BASE_TIMES,
      [['word/theme/theme1.xml', TEMA]],
    );
    const { docx } = conLaLetraDelFormulario(conTema);
    expect(documentoDe(docx)).toContain(
      `<w:r><w:rPr>${DEL_TEMA}</w:rPr><w:t xml:space="preserve">$12.101</w:t></w:r>`,
    );
    expect(comoSeVe(docx).get('$12.101')?.f).toBe('Calibri');
  });

  it('lo que no es un Word vuelve como llegó', () => {
    const basura = Buffer.from('no soy un Word');
    const r = conLaLetraDelFormulario(basura);
    expect(r.cambiadas).toBe(0);
    expect(r.docx).toBe(basura);
  });
});
