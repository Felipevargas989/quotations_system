import { archivoDelZip, nombresDelZip } from '../analisis/docx';
import {
  leerElWord,
  paraLaPantalla,
  type Parrafo,
  type Tabla,
} from '../postulacion/el-word-editable';
import {
  conPropiedad,
  guardarCambios,
  NoSeGuarda,
  OtraVersion,
} from '../postulacion/guardar-el-word';
import { arbolDelXml } from '../postulacion/xml-del-word';
import { zipCon } from './zip-de-prueba';

// EL WORD SE EDITA EN EVENTIA (decisión 78): se lee el texto párrafo por
// párrafo y se guardan solo los párrafos que cambiaron, sin tocar lo demás.
// El Word de prueba tiene la forma de los que entrega la IA (medido en los
// formularios del laboratorio, 24-10): una tabla con estilo que pone en
// negrita la primera fila y la primera columna, celdas juntas, un
// [COMPLETAR] resaltado y lo que no se edita (un vínculo, una imagen).

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const DOCUMENTO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>
<w:p w14:paraId="575AB8C0"><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/><w:b/><w:sz w:val="22"/></w:rPr><w:lastRenderedPageBreak/><w:t>FORMULARIO N°4</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblStyle w:val="Cuadricula"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:firstColumn="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="2000"/></w:tblGrid>
<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="FBD4B4"/></w:tcPr><w:p><w:r><w:t>“CENA DÍA DEL FUNCIONARIO”</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:trPr><w:cnfStyle w:val="000000100000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0"/></w:trPr><w:tc><w:tcPr><w:cnfStyle w:val="001000000000" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">RAZÓN SOCIAL </w:t></w:r></w:p></w:tc><w:tc><w:p><w:bookmarkStart w:id="0" w:name="razon"/><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>[COMPLETAR: razón social]</w:t></w:r><w:proofErr w:type="spellStart"/><w:bookmarkEnd w:id="0"/></w:p></w:tc></w:tr>
<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p><w:hyperlink r:id="rId9"><w:r><w:t>www.valledelsol.cl</w:t></w:r></w:hyperlink></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:pPr><w:rPr><w:ins w:id="1" w:author="IA" w:date="2026-10-24T00:00:00Z"/><w:i/><w:sz w:val="20"/></w:rPr></w:pPr></w:p>
<w:p><w:pPr><w:pStyle w:val="Titulo"/></w:pPr><w:r><w:t>Detalle:</w:t></w:r><w:r><w:tab/><w:t>a &amp; b</w:t><w:br/><w:t>línea 2</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
</w:body></w:document>`;

const ESTILOS = `<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titulo"><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="table" w:styleId="Cuadricula"><w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="70AD47"/></w:tcPr></w:tblStylePr><w:tblStylePr w:type="firstCol"><w:rPr><w:b/></w:rPr></w:tblStylePr></w:style>
</w:styles>`;

const LOGO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const elWord = (documento = DOCUMENTO) =>
  zipCon([
    ['[Content_Types].xml', '<Types/>'],
    ['word/document.xml', documento],
    ['word/styles.xml', ESTILOS],
    ['word/media/image1.png', LOGO],
  ]);

const leido = (docx: Buffer) => {
  const l = leerElWord(docx);
  if (!l) throw new Error('no se leyó');
  return l;
};

const parrafos = (docx: Buffer): Map<number, Parrafo> => {
  const todos = new Map<number, Parrafo>();
  const recorrer = (b: Parrafo | Tabla) => {
    if (b.tipo === 'parrafo') todos.set(b.id, b);
    else b.filas.flat().forEach((c) => c.bloques.forEach(recorrer));
  };
  leido(docx).bloques.forEach(recorrer);
  return todos;
};

const documentoDe = (docx: Buffer) =>
  archivoDelZip(docx, 'word/document.xml')?.toString('utf8') ?? '';

describe('arbolDelXml', () => {
  it('lee etiquetas con «>» entre comillas y salta comentarios y declaraciones', () => {
    const raiz = arbolDelXml(
      '<?xml version="1.0"?><!-- <x> --><a x="1>2"><b/><c>t</c></a>',
    );
    expect(raiz?.hijos.map((h) => h.nombre)).toEqual(['a']);
    expect(raiz?.hijos[0].hijos.map((h) => h.nombre)).toEqual(['b', 'c']);
  });

  it('un XML mal cerrado es null', () => {
    expect(arbolDelXml('<a><b></a>')).toBeNull();
    expect(arbolDelXml('<a>')).toBeNull();
  });
});

describe('leerElWord — lo que ve la pantalla', () => {
  const docx = elWord();

  it('el título, centrado y en negrita, con su tamaño', () => {
    const titulo = leido(docx).bloques[0];
    expect(titulo).toEqual({
      tipo: 'parrafo',
      id: 0,
      editable: true,
      formato: { b: false, i: false, u: false, pt: 12 },
      tramos: [
        { r: 0, t: 'FORMULARIO N°4', b: true, i: false, u: false, pt: 11 },
      ],
      alineacion: 'centro',
    });
  });

  it('la tabla: celdas juntas, anchos, fondos y la negrita que pone su estilo', () => {
    const tabla = leido(docx).bloques[1] as Tabla;
    expect(tabla.tipo).toBe('tabla');
    const [primera, segunda, tercera] = tabla.filas;
    // La primera fila: dos columnas juntas, con su fondo (el de la celda
    // manda sobre el del estilo) y en negrita por el estilo.
    expect(primera).toHaveLength(1);
    expect(primera[0]).toMatchObject({
      columnas: 2,
      ancho: 100,
      fondo: 'FBD4B4',
    });
    expect((primera[0].bloques[0] as Parrafo).tramos[0]).toMatchObject({
      t: '“CENA DÍA DEL FUNCIONARIO”',
      b: true,
      pt: 12,
    });
    // La primera columna va en negrita (cnfStyle) y junta dos filas.
    expect(segunda[0]).toMatchObject({ filas: 2, ancho: 75 });
    expect((segunda[0].bloques[0] as Parrafo).tramos[0]).toMatchObject({
      t: 'RAZÓN SOCIAL ',
      b: true,
      pt: 11,
    });
    expect((segunda[1].bloques[0] as Parrafo).tramos[0]).toMatchObject({
      t: '[COMPLETAR: razón social]',
      b: false,
    });
    // La celda que sigue juntada no se muestra: queda solo la del vínculo.
    expect(tercera).toHaveLength(1);
    expect(tercera[0].bloques[0]).toMatchObject({
      editable: false,
      motivo: 'tiene un vínculo',
      tramos: [{ t: 'www.valledelsol.cl' }],
    });
  });

  it('el párrafo vacío se edita; la imagen no', () => {
    const todos = parrafos(docx);
    // Lo que se escriba en el vacío se ve con el formato de su marca.
    expect(todos.get(6)).toMatchObject({
      editable: true,
      tramos: [],
      formato: { b: false, i: true, u: false, pt: 10 },
    });
    expect(todos.get(8)).toMatchObject({
      editable: false,
      motivo: 'tiene una imagen',
      tramos: [],
    });
  });

  it('el estilo del párrafo da su alineación y su negrita; tabulador y salto de línea van como \\t y \\n', () => {
    expect(parrafos(docx).get(7)).toMatchObject({
      alineacion: 'centro',
      tramos: [
        { r: 0, t: 'Detalle:', b: true },
        { r: 1, t: '\ta & b\nlínea 2', b: true },
      ],
    });
  });

  it('a la pantalla no va el XML', () => {
    expect(Object.keys(paraLaPantalla(leido(docx))).sort()).toEqual([
      'bloques',
      'version',
    ]);
  });

  it('lo que no es un Word es null', () => {
    expect(leerElWord(Buffer.from('no es un zip'))).toBeNull();
    expect(
      leerElWord(zipCon([['word/document.xml', '<w:document><w:body>']])),
    ).toBeNull();
  });
});

describe('guardarCambios — solo lo que cambió', () => {
  const docx = elWord();
  const version = leido(docx).version;

  it('el [COMPLETAR] lleno pierde el resaltado y conserva sus marcadores', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 3, tramos: [{ r: 0, t: 'Valle del Sol SpA' }] },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:p><w:bookmarkStart w:id="0" w:name="razon"/><w:r><w:t xml:space="preserve">Valle del Sol SpA</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>',
    );
  });

  it('todo lo demás queda igual, letra por letra, y el resto del Word también', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 3, tramos: [{ r: 0, t: 'Valle del Sol SpA' }] },
    ]);
    const antes = documentoDe(docx);
    const despues = documentoDe(nuevo);
    const corte = antes.indexOf('<w:p><w:bookmarkStart');
    const finDelParrafo = antes.indexOf('</w:p>', corte) + '</w:p>'.length;
    expect(despues.startsWith(antes.slice(0, corte))).toBe(true);
    expect(despues.endsWith(antes.slice(finDelParrafo))).toBe(true);
    expect(nombresDelZip(nuevo)).toEqual(nombresDelZip(docx));
    expect(archivoDelZip(nuevo, 'word/styles.xml')?.toString('utf8')).toBe(
      ESTILOS,
    );
    expect(archivoDelZip(nuevo, 'word/media/image1.png')).toEqual(LOGO);
  });

  it('quitar la negrita que pone el estilo la apaga en su lugar, sin perder la letra', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 2, tramos: [{ r: 0, t: 'RAZÓN SOCIAL ', b: false }] },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/><w:b w:val="0"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">RAZÓN SOCIAL </w:t></w:r>',
    );
    expect(parrafos(nuevo).get(2)?.tramos[0]).toMatchObject({ b: false });
  });

  it('lo escrito sin corrida toma el formato del pedazo anterior; tabulador, salto y «<» se escriben bien', () => {
    const nuevo = guardarCambios(docx, version, [
      {
        id: 7,
        tramos: [
          { r: 0, t: 'Detalle:', b: true },
          { t: ' nuevo', b: true, i: true },
          { r: 1, t: '\tx < y\nfin', b: true },
        ],
      },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:p><w:pPr><w:pStyle w:val="Titulo"/></w:pPr><w:r><w:t xml:space="preserve">Detalle:</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> nuevo</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">x &lt; y</w:t><w:br/><w:t xml:space="preserve">fin</w:t></w:r></w:p>',
    );
    expect(parrafos(nuevo).get(7)?.tramos).toEqual([
      { r: 0, t: 'Detalle:', b: true, i: false, u: false, pt: 12 },
      { r: 1, t: ' nuevo', b: true, i: true, u: false, pt: 12 },
      { r: 2, t: '\tx < y\nfin', b: true, i: false, u: false, pt: 12 },
    ]);
  });

  it('lo que no cabe en un XML se descarta; los emojis y los acentos quedan', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 3, tramos: [{ r: 0, t: 'Año 2026 \u0001ok 🎉' }] },
    ]);
    expect(parrafos(nuevo).get(3)?.tramos[0].t).toBe('Año 2026 ok 🎉');
  });

  it('en un párrafo vacío se escribe con el formato de su marca, sin las marcas de cambios', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 6, tramos: [{ t: 'Algo' }] },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:p><w:pPr><w:rPr><w:ins w:id="1" w:author="IA" w:date="2026-10-24T00:00:00Z"/><w:i/><w:sz w:val="20"/></w:rPr></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">Algo</w:t></w:r></w:p>',
    );
  });

  it('el Word guardado pesa como el original: su texto va comprimido', () => {
    const grande = elWord(
      DOCUMENTO.replace(
        '</w:body>',
        `${'<w:p><w:r><w:t>relleno</w:t></w:r></w:p>'.repeat(400)}</w:body>`,
      ),
    );
    const nuevo = guardarCambios(grande, leido(grande).version, [
      { id: 3, tramos: [{ r: 0, t: 'Valle del Sol SpA' }] },
    ]);
    expect(nuevo.length).toBeLessThan(grande.length * 1.2);
  });

  it('el Word guardado se vuelve a abrir, con otra versión', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 3, tramos: [{ r: 0, t: 'Valle del Sol SpA' }] },
    ]);
    expect(leido(nuevo).version).not.toBe(version);
    expect(parrafos(nuevo).get(3)?.tramos[0].t).toBe('Valle del Sol SpA');
  });

  it('si el Word cambió desde que se abrió, no se guarda encima', () => {
    expect(() =>
      guardarCambios(docx, 'a'.repeat(40), [
        { id: 3, tramos: [{ r: 0, t: 'x' }] },
      ]),
    ).toThrow(OtraVersion);
  });

  it('lo que no se edita aquí no se guarda: un vínculo, una celda juntada, un párrafo que no existe o repetido', () => {
    for (const ids of [[5], [4], [99], [3, 3]]) {
      expect(() =>
        guardarCambios(
          docx,
          version,
          ids.map((id) => ({ id, tramos: [{ t: 'x' }] })),
        ),
      ).toThrow(NoSeGuarda);
    }
  });
});

describe('guardarCambios — la alineación del párrafo', () => {
  const docx = elWord();
  const version = leido(docx).version;
  const tramosDe = (id: number) =>
    (parrafos(docx).get(id)?.tramos ?? []).map(({ r, t, b, i, u }) => ({
      r,
      t,
      b,
      i,
      u,
    }));

  it('cambia la del título en su lugar y se lee de vuelta', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 0, tramos: tramosDe(0), alineacion: 'derecha' },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:pPr><w:jc w:val="right"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>',
    );
    expect(parrafos(nuevo).get(0)?.alineacion).toBe('derecha');
  });

  it('a un párrafo sin diseño le crea uno, y va antes de la marca del párrafo', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 3, tramos: tramosDe(3), alineacion: 'centro' },
      { id: 6, tramos: [], alineacion: 'derecha' },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:bookmarkStart',
    );
    expect(documentoDe(nuevo)).toContain(
      '<w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:ins',
    );
  });

  it('la misma alineación que ya tenía no toca el diseño', () => {
    const nuevo = guardarCambios(docx, version, [
      { id: 0, tramos: tramosDe(0), alineacion: 'centro' },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>',
    );
  });
});

describe('conPropiedad — cada propiedad en su lugar', () => {
  it('la negrita va después de la letra y antes del tamaño; lo desconocido queda al final', () => {
    expect(
      conPropiedad(
        '<w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/><w14:ligatures w14:val="all"/></w:rPr>',
        'w:b',
        '<w:b/>',
      ),
    ).toBe(
      '<w:rPr><w:rFonts w:ascii="Calibri"/><w:b/><w:sz w:val="22"/><w14:ligatures w14:val="all"/></w:rPr>',
    );
  });

  it('el subrayado va después del resaltado y antes del idioma', () => {
    expect(
      conPropiedad(
        '<w:rPr><w:highlight w:val="yellow"/><w:lang w:val="es-CL"/></w:rPr>',
        'w:u',
        '<w:u w:val="single"/>',
      ),
    ).toBe(
      '<w:rPr><w:highlight w:val="yellow"/><w:u w:val="single"/><w:lang w:val="es-CL"/></w:rPr>',
    );
  });

  it('reemplaza la que había y, si no queda nada, no deja un rPr vacío', () => {
    expect(
      conPropiedad('<w:rPr><w:b/></w:rPr>', 'w:b', '<w:b w:val="0"/>'),
    ).toBe('<w:rPr><w:b w:val="0"/></w:rPr>');
    expect(conPropiedad('<w:rPr><w:b/></w:rPr>', 'w:b', null)).toBe('');
    expect(conPropiedad('', 'w:i', '<w:i/>')).toBe('<w:rPr><w:i/></w:rPr>');
  });
});

describe('leerElWord — lo que se ve: encabezado, imágenes, letra, color y saltos de página', () => {
  const R =
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const DOC = `<w:document ${W} ${R}><w:body>
<w:p><w:r><w:rPr><w:color w:val="E36C0A"/></w:rPr><w:t>Debe contener la totalidad</w:t></w:r></w:p>
<w:p><w:r><w:t>Antes</w:t><w:br w:type="page"/><w:t>Después</w:t></w:r></w:p>
<w:p><w:hyperlink r:id="rId9"><w:r><w:rPr><w:b/></w:rPr><w:t>Correo: </w:t></w:r><w:r><w:t>contacto@valledelsol.cl</w:t></w:r></w:hyperlink></w:p>
<w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>[ILEGIBLE]</w:t></w:r></w:p>
<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/></w:sectPr>
</w:body></w:document>`;
  const ENCABEZADO = `<w:hdr ${W} ${R}><w:p><w:r><w:drawing><wp:inline><wp:extent cx="762000" cy="381000"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>MUNICIPALIDAD DE QUILLÓN</w:t></w:r></w:p></w:hdr>`;
  const PIE = `<w:ftr ${W}><w:p><w:r><w:t>Página 1</w:t></w:r></w:p></w:ftr>`;
  const RELS = `<Relationships><Relationship Id="rIdH" Type="header" Target="header1.xml"/><Relationship Id="rIdF" Type="footer" Target="footer1.xml"/><Relationship Id="rId9" Type="hyperlink" Target="mailto:x" TargetMode="External"/></Relationships>`;
  const RELS_ENCABEZADO = `<Relationships><Relationship Id="rId1" Type="image" Target="media/image1.png"/></Relationships>`;
  const TEMA = `<a:theme><a:themeElements><a:fontScheme><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
  const ESTILOS_CON_TEMA = `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const docx = zipCon([
    ['[Content_Types].xml', '<Types/>'],
    ['word/document.xml', DOC],
    ['word/_rels/document.xml.rels', RELS],
    ['word/header1.xml', ENCABEZADO],
    ['word/_rels/header1.xml.rels', RELS_ENCABEZADO],
    ['word/footer1.xml', PIE],
    ['word/media/image1.png', LOGO],
    ['word/styles.xml', ESTILOS_CON_TEMA],
    ['word/theme/theme1.xml', TEMA],
  ]);
  const lectura = leido(docx);
  const [color, salto, vinculo] = lectura.bloques as Parrafo[];

  it('el encabezado se ve con su logo y su texto, sin editarse; el pie también', () => {
    const [encabezado] = (lectura.encabezado ?? []) as Parrafo[];
    expect(encabezado).toMatchObject({
      editable: false,
      motivo: 'está en el encabezado',
      tramos: [{ t: 'MUNICIPALIDAD DE QUILLÓN', b: true, f: 'Calibri' }],
      imagenes: [
        {
          src: `data:image/png;base64,${LOGO.toString('base64')}`,
          ancho: 60,
          alto: 30,
        },
      ],
    });
    expect(lectura.pie?.[0]).toMatchObject({
      editable: false,
      motivo: 'está en el pie de página',
      tramos: [{ t: 'Página 1' }],
    });
    expect(Object.keys(paraLaPantalla(lectura)).sort()).toEqual([
      'bloques',
      'encabezado',
      'pie',
      'version',
    ]);
  });

  it('la letra del tema y el color de cada pedazo', () => {
    expect(color.tramos[0]).toMatchObject({
      t: 'Debe contener la totalidad',
      f: 'Calibri',
      c: 'E36C0A',
      pt: 11,
    });
  });

  it('un salto de página no deja el párrafo sin editar, y se guarda en su lugar', () => {
    expect(salto).toMatchObject({
      editable: true,
      tramos: [{ r: 0, t: 'Antes\fDespués' }],
    });
    const nuevo = guardarCambios(docx, lectura.version, [
      { id: salto.id, tramos: [{ r: 0, t: 'Antes\fDespués, corregido' }] },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:r><w:t xml:space="preserve">Antes</w:t><w:br w:type="page"/><w:t xml:space="preserve">Después, corregido</w:t></w:r>',
    );
  });

  it('lo que no se edita se ve con el formato de cada pedazo', () => {
    expect(vinculo).toMatchObject({
      editable: false,
      motivo: 'tiene un vínculo',
      tramos: [
        { t: 'Correo: ', b: true },
        { t: 'contacto@valledelsol.cl', b: false },
      ],
    });
  });

  it('el [ILEGIBLE] corregido pierde el resaltado, como el [COMPLETAR]', () => {
    const ilegible = lectura.bloques[3] as Parrafo;
    const nuevo = guardarCambios(docx, lectura.version, [
      { id: ilegible.id, tramos: [{ r: 0, t: 'Ilustre Municipalidad' }] },
    ]);
    expect(documentoDe(nuevo)).toContain(
      '<w:p><w:r><w:t xml:space="preserve">Ilustre Municipalidad</w:t></w:r></w:p>',
    );
  });
});
