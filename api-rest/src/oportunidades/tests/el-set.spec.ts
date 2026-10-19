import type { DocumentoDeEmpresa } from '../oferente/oferente.repository';
import {
  type ArchivoDelSet,
  armarElSet,
  conLaPropuestaQueNombran,
  conLosRespaldos,
  type DatosDelSet,
  mismoFormulario,
  rutasEnElZip,
} from '../postulacion/el-set';

// QUÉ VA EN EL SET PARA MERCADO PÚBLICO (decisión 34): la última corrida de
// la IA, firmada si se firmó; cada cosa en la carpeta que dicen las bases;
// de la carpeta de la empresa, solo lo que piden; y la lista de lo que
// falta antes de subir.

const archivo = (
  id: number,
  nombre: string,
  extra: Partial<ArchivoDelSet> = {},
): ArchivoDelSet => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/x_${id}`,
  bytes: 1000,
  seccion: 'postulacion',
  origen: 'generado',
  viene_de: null,
  generacion_id: null,
  creado_en: '2026-10-19T12:00:00.000Z',
  ...extra,
});

const documento = (
  id: number,
  tipo: string,
  nombre: string,
  extra: Partial<DocumentoDeEmpresa> = {},
): DocumentoDeEmpresa => ({
  id,
  tipo,
  nombre,
  ruta: `c1/oferente/documentos/${id}`,
  tipo_archivo: 'application/pdf',
  bytes: 2000,
  vence: null,
  datos: null,
  creado_en: '2026-10-01T12:00:00.000Z',
  quien: null,
  ...extra,
});

const datos = (extra: Partial<DatosDelSet> = {}): DatosDelSet => ({
  archivos: [
    archivo(6, 'Formularios_Anexos.docx', {
      seccion: 'bases',
      origen: 'subido',
    }),
    archivo(4, 'Bases.pdf', { seccion: 'bases', origen: 'subido' }),
    // Una corrida vieja de los anexos, y su firma: ya no van.
    archivo(10, 'Formularios_Anexos - lleno.docx', {
      viene_de: 6,
      generacion_id: 1,
      creado_en: '2026-10-19T10:00:00.000Z',
    }),
    archivo(15, 'Formularios_Anexos - firmado.docx', {
      origen: 'firmado',
      viene_de: 10,
      creado_en: '2026-10-19T10:30:00.000Z',
    }),
    // La última corrida, firmada.
    archivo(12, 'Formularios_Anexos - lleno.docx', {
      viene_de: 6,
      generacion_id: 3,
      creado_en: '2026-10-19T12:00:00.000Z',
    }),
    archivo(14, 'Formularios_Anexos - firmado.docx', {
      origen: 'firmado',
      viene_de: 12,
      creado_en: '2026-10-19T12:30:00.000Z',
    }),
    // Del PDF salió un Word por formulario (aquí, solo uno).
    archivo(20, 'Anexo N°5 - Oferta económica - lleno.docx', {
      viene_de: 4,
      generacion_id: 3,
    }),
    archivo(30, 'Propuesta técnica 1532886-5-LE26.docx', {
      generacion_id: 4,
      creado_en: '2026-10-19T13:00:00.000Z',
    }),
    archivo(40, 'Patente 2026.pdf', { origen: 'subido' }),
  ],
  formularios: [
    {
      nombre: 'Formulario N°1 - Identificación del oferente',
      archivo: 'Formularios_Anexos.docx',
      aplica: true,
      se_entrega_en: 'administrativa',
    },
    {
      nombre: 'Formulario N°3 - Experiencia',
      archivo: 'Formularios_Anexos.docx',
      aplica: true,
      se_entrega_en: 'tecnica',
    },
    {
      nombre: 'Anexo N°5 - Oferta económica',
      archivo: 'Bases.pdf',
      aplica: true,
      se_entrega_en: 'economica',
    },
    {
      nombre: 'Anexo N°6 - Unión temporal de proveedores',
      archivo: 'Bases.pdf',
      aplica: false,
      se_entrega_en: 'administrativa',
    },
    {
      nombre: 'Anexo N°7 - Calidad de la oferta',
      archivo: 'Bases.pdf',
      aplica: true,
      se_entrega_en: 'tecnica',
    },
  ],
  requisitos: [
    { que: 'Patente municipal vigente' },
    { que: 'Certificado de antecedentes laborales y previsionales (F30)' },
    { que: 'Programa de integridad' },
    { que: 'Resolución sanitaria del lugar de elaboración' },
    { que: 'Propuesta técnica' },
    { que: 'Experiencia acreditada con órdenes de compra' },
  ],
  carpeta: [
    documento(1, 'patente', 'Patente vieja.pdf'),
    documento(2, 'f30', 'F30 septiembre.pdf', { vence: '2026-10-01' }),
    documento(3, 'programa_integridad', 'Programa de integridad.pdf'),
    documento(4, 'inicio_actividades', 'Inicio de actividades.pdf'),
    documento(5, 'respaldo_experiencia', 'OC 4352-103-SE23.pdf', {
      datos: { numero: '4352-103-SE23', fuente: 'mercado_publico' },
    }),
    documento(6, 'respaldo_experiencia', 'OC 999-1-SE22.pdf', {
      datos: { numero: '999-1-SE22', fuente: 'mercado_publico' },
    }),
  ],
  inicioDe: new Map([
    [1, '2026-10-19T09:00:00.000Z'],
    [3, '2026-10-19T11:00:00.000Z'],
    [4, '2026-10-19T13:00:00.000Z'],
  ]),
  ofertaLista: '2026-10-19T12:00:00.000Z',
  corte: '2026-10-19',
  ...extra,
});

const pieza = (set: ReturnType<typeof armarElSet>, nombre: string) =>
  set.piezas.find((p) => p.nombre === nombre);

describe('el set para Mercado Público', () => {
  it('lleva la última corrida de los anexos, firmada, en las carpetas de sus formularios', () => {
    const set = armarElSet(datos());
    const anexos = set.piezas.filter((p) =>
      p.nombre.startsWith('Formularios_Anexos'),
    );
    expect(anexos).toHaveLength(1);
    expect(anexos[0]).toMatchObject({
      nombre: 'Formularios_Anexos - firmado.docx',
      ruta: 'c1/oportunidades/40/x_14',
      carpetas: ['administrativa', 'tecnica'],
      que_es: 'formulario',
      // Firmado, pero hecho antes de la última oferta.
      aviso: 'se hizo antes de la última oferta',
    });
    expect(set.faltan).toContain(
      '«Formularios_Anexos - lleno.docx» se hizo antes de la última oferta: vuelve a generarlo.',
    );
  });

  it('cada Word que salió de un PDF va en la carpeta de su formulario, y avisa si va sin firma', () => {
    const set = armarElSet(datos());
    expect(
      pieza(set, 'Anexo N°5 - Oferta económica - lleno.docx'),
    ).toMatchObject({
      carpetas: ['economica'],
      aviso: 'sin firma · se hizo antes de la última oferta',
    });
    expect(set.faltan).toContain(
      '«Anexo N°5 - Oferta económica - lleno.docx» va sin firma: usa «Firmar» si el formulario la pide.',
    );
  });

  it('avisa el formulario que nadie llenó, pero no el que no aplica', () => {
    const set = armarElSet(datos());
    expect(set.faltan).toContain(
      'Falta «Anexo N°7 - Calidad de la oferta»: genéralo con «Generar anexos» o súbelo lleno a «Mi postulación».',
    );
    expect(set.faltan.join(' ')).not.toContain('Unión temporal');
  });

  it('la propuesta técnica va en la técnica; lo subido a mano, todo', () => {
    const set = armarElSet(datos());
    expect(pieza(set, 'Propuesta técnica 1532886-5-LE26.docx')).toMatchObject({
      carpetas: ['tecnica'],
      que_es: 'propuesta',
      aviso: 'sin firma',
    });
    expect(pieza(set, 'Patente 2026.pdf')).toMatchObject({
      carpetas: ['administrativa'],
      que_es: 'subido',
    });
    expect(set.faltan.join(' ')).not.toContain('Falta la propuesta técnica');
  });

  it('de la carpeta de la empresa, solo lo que piden las bases, y avisa lo vencido y lo que no está', () => {
    const set = armarElSet(datos());
    const documentos = set.piezas.filter((p) => p.que_es === 'documento');
    // La patente ya la subió a mano: no va dos veces.
    expect(documentos.map((d) => d.nombre)).toEqual([
      'Programa de integridad.pdf',
      'F30 septiembre.pdf',
    ]);
    expect(pieza(set, 'F30 septiembre.pdf')).toMatchObject({
      carpetas: ['administrativa'],
      aviso: 'vencido el 01-10-2026',
    });
    expect(set.faltan).toEqual(
      expect.arrayContaining([
        '«Certificado F30» venció el 01-10-2026: súbelo renovado en «Mi empresa».',
        'Las bases piden «Resolución sanitaria» y no está en tu carpeta: súbelo en «Mi empresa».',
      ]),
    );
    // No lo piden: no va (más es menos).
    expect(pieza(set, 'Inicio de actividades.pdf')).toBeUndefined();
  });

  it('si las bases traen el formato como formulario, no va el documento de la carpeta', () => {
    const d = datos();
    const set = armarElSet({
      ...d,
      formularios: [
        ...d.formularios,
        {
          nombre: 'Anexo N°8 - Programa de integridad',
          archivo: 'Bases.pdf',
          aplica: true,
          se_entrega_en: 'administrativa',
        },
      ],
    });
    expect(pieza(set, 'Programa de integridad.pdf')).toBeUndefined();
  });

  it('pide la propuesta técnica si las bases la piden y no está', () => {
    const d = datos();
    const set = armarElSet({
      ...d,
      archivos: d.archivos.filter((a) => a.id !== 30),
    });
    expect(set.faltan).toContain(
      'Falta la propuesta técnica: créala con «Crear propuesta técnica».',
    );
  });

  it('suma los respaldos que nombran los anexos, juntos en la técnica', () => {
    const d = datos();
    const set = conLosRespaldos(
      armarElSet(d),
      [
        {
          texto:
            'Formulario N°3 | 1 | Municipalidad de Quillón | N° 4352-103-SE23 | 2023',
          carpetas: ['administrativa', 'tecnica'],
        },
      ],
      d,
    );
    const respaldos = set.piezas.filter((p) => p.que_es === 'respaldo');
    expect(respaldos).toEqual([
      expect.objectContaining({
        nombre: 'OC 4352-103-SE23.pdf',
        carpetas: ['tecnica'],
        subcarpeta: 'Respaldos de experiencia',
      }),
    ]);
    expect(set.faltan.join(' ')).not.toContain('experiencia');
  });

  it('si piden experiencia y no hay respaldos, lo dice', () => {
    const d = datos();
    const sinRespaldos = {
      ...d,
      carpeta: d.carpeta.filter((x) => x.tipo !== 'respaldo_experiencia'),
    };
    const set = conLosRespaldos(armarElSet(sinRespaldos), [], sinRespaldos);
    expect(set.faltan).toContain(
      'Las bases piden experiencia: sube sus órdenes de compra o facturas como «Respaldo de experiencia» en «Mi empresa».',
    );
  });

  it('si un anexo remite a la propuesta en formato propio y no está, lo dice', () => {
    const d = datos();
    const sinPropuesta = armarElSet({
      ...d,
      archivos: d.archivos.filter((a) => a.id !== 30),
    });
    const texto = {
      texto: 'Anexo N°4 | Se adjunta propuesta técnica en formato propio.',
    };
    expect(conLaPropuestaQueNombran(sinPropuesta, [texto]).faltan).toContain(
      'Un anexo dice que se adjunta la propuesta técnica en formato propio, y la propuesta no está: vuelve a armar la postulación.',
    );
    const conPropuesta = armarElSet(d);
    expect(conLaPropuestaQueNombran(conPropuesta, [texto])).toBe(conPropuesta);
  });

  it('dentro del ZIP: una ruta por carpeta y sin nombres repetidos', () => {
    const rutas = rutasEnElZip([
      {
        nombre: 'Anexos.docx',
        ruta: 'a',
        bytes: 1,
        carpetas: ['administrativa', 'tecnica'],
        que_es: 'formulario',
        aviso: null,
      },
      {
        nombre: 'Anexos.docx',
        ruta: 'b',
        bytes: 1,
        carpetas: ['administrativa'],
        que_es: 'subido',
        aviso: null,
      },
      {
        nombre: 'OC 1.pdf',
        ruta: 'c',
        bytes: 1,
        carpetas: ['tecnica'],
        subcarpeta: 'Respaldos de experiencia',
        que_es: 'respaldo',
        aviso: null,
      },
    ]);
    expect(rutas).toEqual([
      ['1. Administrativa/Anexos.docx', '2. Técnica/Anexos.docx'],
      ['1. Administrativa/Anexos (2).docx'],
      ['2. Técnica/Respaldos de experiencia/OC 1.pdf'],
    ]);
  });

  it('reconoce un formulario por su número o por su nombre', () => {
    expect(
      mismoFormulario(
        'Formulario N°1 - Identificación del oferente',
        'Formulario N° 1 - lleno.docx',
      ),
    ).toBe(true);
    expect(mismoFormulario('Anexo N°3', 'ANEXO Nº3 Experiencia.pdf')).toBe(
      true,
    );
    expect(mismoFormulario('Anexo N°3', 'Formulario 3.docx')).toBe(false);
    expect(mismoFormulario('Anexo N°3', 'Anexo N°13.docx')).toBe(false);
    expect(
      mismoFormulario(
        'Declaración jurada de trabajadores',
        'declaracion_jurada_de_trabajadores firmada.pdf',
      ),
    ).toBe(true);
  });
});
