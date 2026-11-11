import type { Adjunto } from '../adjuntos/adjuntos.repository';
import { armarContenido, esLeible, separar } from '../analisis/comun';
import {
  AVISO_DE_CORTE,
  MAX_CARACTERES_DEL_EXCEL,
  claseDeFormato,
  fechaDeExcel,
  textoDeXlsx,
} from '../analisis/xlsx';
import { wordCon, zipCon } from './zip-de-prueba';

// LAS BASES EN EXCEL (decisión 126 del doc 17, 11-11-2026). La
// 2416-342-COT26 traía como única base un Excel y el análisis respondió
// «Ninguno de los archivos se puede leer». Desde la 126 la IA lo lee como
// texto, igual que el Word.

const RELS_DEL_LIBRO = [
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>',
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet1.xml"/>',
  '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
  '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  '</Relationships>',
].join('');

const libro = (extra = '') =>
  [
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    extra,
    '<sheets>',
    '<sheet name="Requerimiento" sheetId="1" r:id="rId1"/>',
    '<sheet name="Listas &amp; valores" sheetId="2" state="hidden" r:id="rId2"/>',
    '<sheet name="Gráfico" sheetId="3" r:id="rId3"/>',
    '</sheets></workbook>',
  ].join('');

const TEXTOS = [
  '<sst count="3" uniqueCount="3">',
  '<si><t>FECHA</t></si>',
  '<si><r><rPr><b/></rPr><t xml:space="preserve">ALMUERZO </t></r><r><t>PARA 170</t></r><rPh sb="0" eb="1"><t>ふりがな</t></rPh></si>',
  '<si><t>Valle &amp; Sol_x000D_\nlínea 2</t></si>',
  '</sst>',
].join('');

// cellStyleXfs va antes con un 14 (fecha) que NO es de las celdas: el
// estilo s="0" de una celda es el primero de cellXfs (General).
const ESTILOS = [
  '<styleSheet>',
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/></numFmts>',
  '<cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>',
  '<cellXfs count="6">',
  '<xf numFmtId="0" fontId="0"/>',
  '<xf numFmtId="14" applyNumberFormat="1"/>',
  '<xf numFmtId="164" applyNumberFormat="1"><alignment wrapText="1"/></xf>',
  '<xf numFmtId="9" applyNumberFormat="1"/>',
  '<xf numFmtId="22" applyNumberFormat="1"/>',
  '<xf numFmtId="4" applyNumberFormat="1"/>',
  '</cellXfs></styleSheet>',
].join('');

const HOJA_1 = [
  '<worksheet><sheetData>',
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"><v>46357</v></c></row>',
  '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" s="5"><v>3400000</v></c>',
  '<c r="C2" s="3"><v>0.19</v></c><c r="D2" t="b"><v>1</v></c></row>',
  '<row r="3" spans="1:3"/>',
  '<row r="4"><c r="A4" t="inlineStr"><is><t>Concepción</t></is></c>',
  '<c r="B4" t="str"><f>A4&amp;"!"</f><v>Concepción!</v></c>',
  '<c r="C4"><f>SUM(B2:B3)</f></c>',
  '<c r="D4" s="4"><v>46357.5</v></c>',
  '<c r="E4" s="2"><v>46357</v></c>',
  '<c r="F4" s="1"/>',
  '<c r="G4"><v>0.30000000000000004</v></c></row>',
  '<row r="5"><c r="A5" t="s"><v>2</v></c></row>',
  '<row><c t="inlineStr"><is><t>sin referencia</t></is></c><c t="inlineStr"><is><t>al lado</t></is></c></row>',
  '</sheetData></worksheet>',
].join('');

const HOJA_2 =
  '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Lista</t></is></c></row></sheetData></worksheet>';

const excel = (archivos: Array<[string, string]> = []): Buffer =>
  zipCon([
    ['[Content_Types].xml', '<Types/>'],
    ['xl/workbook.xml', libro()],
    ['xl/_rels/workbook.xml.rels', RELS_DEL_LIBRO],
    ['xl/sharedStrings.xml', TEXTOS],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', HOJA_1],
    ['xl/worksheets/sheet2.xml', HOJA_2],
    ...archivos,
  ]);

describe('el texto de un Excel', () => {
  it('cada hoja con su nombre y una línea por fila, con la celda delante', () => {
    const texto = textoDeXlsx(excel()) ?? '';
    expect(texto).toContain('Hoja «Requerimiento»\nA1: FECHA | B1: 01-12-2026');
    expect(texto).toContain(
      'A2: ALMUERZO PARA 170 | B2: 3400000 | C2: 19% | D2: VERDADERO',
    );
    expect(texto).toContain(
      'A4: Concepción | B4: Concepción! | C4: =SUM(B2:B3) | D4: 01-12-2026 12:00 | E4: 01-12-2026 | G4: 0.3',
    );
    expect(texto).toContain('A5: Valle & Sol\nlínea 2');
    // Una fila y celdas sin referencia siguen a la anterior.
    expect(texto).toContain('A6: sin referencia | B6: al lado');
    expect(texto).toContain('Hoja «Listas & valores» (oculta)\nA1: Lista');
    expect(texto).not.toContain('F4');
    expect(texto).not.toContain('ふりがな');
    expect(texto).not.toContain('Gráfico');
    expect(texto).not.toMatch(/<\w/);
  });

  it('también si el ZIP guarda sin comprimir y con prefijos en las etiquetas', () => {
    const hoja =
      '<x:worksheet><x:sheetData><x:row r="2"><x:c r="C2" t="inlineStr"><x:is><x:t>Hola</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>';
    const zip = zipCon(
      [
        ['xl/workbook.xml', libro()],
        ['xl/_rels/workbook.xml.rels', RELS_DEL_LIBRO],
        ['xl/worksheets/sheet1.xml', hoja],
        ['xl/worksheets/sheet2.xml', HOJA_2],
      ],
      false,
    );
    expect(textoDeXlsx(zip)).toContain('Hoja «Requerimiento»\nC2: Hola');
  });

  it('un libro de Mac antiguo cuenta desde 1904', () => {
    const zip = zipCon([
      ['xl/workbook.xml', libro('<workbookPr date1904="1"/>')],
      ['xl/_rels/workbook.xml.rels', RELS_DEL_LIBRO],
      ['xl/styles.xml', ESTILOS],
      [
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" s="1"><v>0</v></c></row></sheetData></worksheet>',
      ],
    ]);
    expect(textoDeXlsx(zip)).toContain('A1: 01-01-1904');
  });

  it('sin la lista de relaciones, lee las hojas que haya; una que no abre se dice', () => {
    const zip = zipCon([
      ['xl/workbook.xml', '<workbook><sheets/></workbook>'],
      ['xl/worksheets/sheet10.xml', HOJA_2],
      [
        'xl/worksheets/sheet2.xml',
        '<worksheet><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>',
      ],
    ]);
    expect(textoDeXlsx(zip)).toBe(
      'Hoja «Hoja 1»\nA1: 7\n\nHoja «Hoja 2»\nA1: Lista',
    );
    const sinHoja = zipCon([
      ['xl/workbook.xml', libro()],
      ['xl/_rels/workbook.xml.rels', RELS_DEL_LIBRO],
      ['xl/worksheets/sheet2.xml', '<worksheet><sheetData/></worksheet>'],
    ]);
    expect(textoDeXlsx(sinHoja)).toBe(
      'Hoja «Requerimiento»: no se pudo abrir.\n\nHoja «Listas & valores» (oculta): vacía.',
    );
  });

  it('una planilla enorme se corta con aviso, sin pasar el tope', () => {
    const fila = (n: number) =>
      `<row r="${n}"><c r="A${n}" t="inlineStr"><is><t>${'x'.repeat(990)}</t></is></c></row>`;
    const filas = Array.from({ length: 400 }, (_, i) => fila(i + 1)).join('');
    const grande = zipCon([
      ['xl/workbook.xml', libro()],
      ['xl/_rels/workbook.xml.rels', RELS_DEL_LIBRO],
      [
        'xl/worksheets/sheet1.xml',
        `<worksheet><sheetData>${filas}</sheetData></worksheet>`,
      ],
      ['xl/worksheets/sheet2.xml', HOJA_2],
    ]);
    const texto = textoDeXlsx(grande) ?? '';
    expect(texto.endsWith(AVISO_DE_CORTE)).toBe(true);
    expect(texto.length).toBeLessThanOrEqual(
      MAX_CARACTERES_DEL_EXCEL + AVISO_DE_CORTE.length + 100,
    );
    expect(texto).not.toContain('Listas');
  });

  it('lo que no es un Excel devuelve null, sin reventar', () => {
    expect(textoDeXlsx(Buffer.from('esto no es un zip'))).toBeNull();
    expect(textoDeXlsx(wordCon(['un Word']))).toBeNull();
    expect(
      textoDeXlsx(zipCon([['xl/workbook.xml', '<workbook/>']])),
    ).toBeNull();
  });
});

describe('los formatos de un Excel', () => {
  it('fecha, fecha con hora, porcentaje o número', () => {
    expect(claseDeFormato('dd/mm/yyyy;@')).toBe('fecha');
    expect(claseDeFormato('[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy')).toBe(
      'fecha',
    );
    expect(claseDeFormato('d/m/yy h:mm')).toBe('fechaHora');
    expect(claseDeFormato('[h]:mm:ss')).toBe('fechaHora');
    expect(claseDeFormato('0.0%')).toBe('porcentaje');
    expect(claseDeFormato('General')).toBeNull();
    expect(claseDeFormato('#,##0 "días";[Red]-#,##0')).toBeNull();
    expect(claseDeFormato('_-* #,##0_-;-* #,##0_-;_-* "-"_-;_-@_-')).toBeNull();
    expect(claseDeFormato('"$"#,##0')).toBeNull();
  });

  it('el número de Excel como fecha, con el 29-02-1900 que no existió', () => {
    expect(fechaDeExcel(46287, false, false)).toBe('22-09-2026');
    expect(fechaDeExcel(1, false, false)).toBe('01-01-1900');
    expect(fechaDeExcel(61, false, false)).toBe('01-03-1900');
    expect(fechaDeExcel(0.75, false, true)).toBe('18:00');
    expect(fechaDeExcel(-1, false, false)).toBeNull();
  });
});

const adjunto = (id: number, nombre: string): Adjunto =>
  ({
    id,
    nombre,
    ruta: `c1/oportunidades/40/${nombre}`,
    bytes: 1000,
    creado_en: `2026-11-11T14:00:0${id}.000Z`,
  }) as Adjunto;

describe('el Excel en la puerta común de la IA', () => {
  it('el .xlsx se lee; el .xls antiguo y el ZIP se avisan con su motivo', () => {
    expect(esLeible('Formulario Requerimiento.XLSX')).toBe(true);
    const { leibles, noLeidos } = separar([
      adjunto(1, 'Requerimiento.xlsx'),
      adjunto(2, 'Planilla vieja.xls'),
      adjunto(3, 'Anexos.zip'),
    ]);
    expect(leibles.map((a) => a.nombre)).toEqual(['Requerimiento.xlsx']);
    expect(noLeidos).toEqual([
      {
        nombre: 'Planilla vieja.xls',
        motivo:
          'es un Excel antiguo (.xls): guárdalo como .xlsx y súbelo de nuevo',
      },
      {
        nombre: 'Anexos.zip',
        motivo:
          'la IA lee PDF, Word y Excel; si es un ZIP, sube lo que trae adentro',
      },
    ]);
  });

  it('va a Claude como texto; uno que no abre queda en «sin abrir»', async () => {
    const archivos: Record<string, Buffer> = {
      'c1/req.xlsx': excel(),
      'c1/roto.xlsx': Buffer.from('no es un Excel'),
    };
    const { bloques, sinAbrir } = await armarContenido(
      [
        { nombre: 'Requerimiento.xlsx', ruta: 'c1/req.xlsx' },
        { nombre: 'Roto.xlsx', ruta: 'c1/roto.xlsx' },
      ],
      (ruta) => Promise.resolve(archivos[ruta]),
    );
    expect(bloques).toHaveLength(1);
    expect(bloques[0].title).toBe('Requerimiento.xlsx');
    expect(bloques[0].source).toMatchObject({
      type: 'text',
      media_type: 'text/plain',
    });
    expect((bloques[0].source as { data: string }).data).toContain(
      'A1: FECHA | B1: 01-12-2026',
    );
    expect(sinAbrir).toEqual([
      { nombre: 'Roto.xlsx', motivo: 'no se pudo abrir' },
    ]);
  });
});
