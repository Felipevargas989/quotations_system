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
      // Firmado antes de la última oferta: lo firmado no se rehace al
      // volver a armar (decisión 49), así que no queda «viejo».
      aviso: null,
    });
    expect(set.faltan).not.toContain(
      '«Formularios_Anexos - lleno.docx» se hizo antes de la última oferta: vuelve a generarlo.',
    );
    // Lo que no está firmado y se hizo antes, sí se avisa.
    expect(set.faltan).toContain(
      '«Anexo N°5 - Oferta económica - lleno.docx» se hizo antes de la última oferta: vuelve a generarlo.',
    );
  });

  it('«Volver a armar» (decisión 49): de cada formulario va su versión más nueva, aunque venga de otra corrida; lo firmado de la económica con otro precio se avisa', () => {
    const d = datos();
    const comprador = d.archivos.find(
      (a) => a.seccion === 'bases',
    ) as (typeof d.archivos)[number];
    const lleno = (id: number, n: number, generacion: number, creado: string) =>
      archivo(id, `Formulario N°${n} - lleno.docx`, {
        viene_de: comprador.id,
        generacion_id: generacion,
        creado_en: creado,
      });
    const set = armarElSet({
      ...d,
      formularios: [
        {
          nombre: 'Formulario N°1',
          archivo: comprador.nombre,
          aplica: true,
          se_entrega_en: 'administrativa',
        },
        {
          nombre: 'Formulario N°2',
          archivo: comprador.nombre,
          aplica: true,
          se_entrega_en: 'economica',
        },
      ],
      archivos: [
        comprador,
        // La corrida 7: los dos, y los dos firmados.
        lleno(71, 1, 7, '2026-10-19T17:22:00.000Z'),
        lleno(72, 2, 7, '2026-10-19T17:22:00.000Z'),
        archivo(73, 'Formulario N°1 - firmado.pdf', {
          origen: 'firmado',
          viene_de: 71,
          creado_en: '2026-10-19T17:30:00.000Z',
        }),
        archivo(74, 'Formulario N°2 - firmado.pdf', {
          origen: 'firmado',
          viene_de: 72,
          creado_en: '2026-10-19T17:31:00.000Z',
        }),
      ],
      inicioDe: new Map([[7, '2026-10-19T17:20:00.000Z']]),
      ofertaLista: '2026-10-19T21:00:00.000Z',
      precio: 15_900_000,
      precioDe: new Map([[7, 14_000_000]]),
    });
    expect(
      set.piezas
        .filter((p) => p.que_es === 'formulario')
        .map((p) => [p.nombre, p.aviso]),
    ).toEqual([
      ['Formulario N°1 - firmado.pdf', null],
      ['Formulario N°2 - firmado.pdf', 'firmado con otro precio'],
    ]);
    expect(set.faltan).toContain(
      '«Formulario N°2 - firmado.pdf» está firmado con otro precio: bórralo y vuelve a armar la postulación.',
    );
  });

  it('con un archivo por formulario (19-10), cada uno va solo a su carpeta, y el firmado en PDF', () => {
    const d = datos();
    const set = armarElSet({
      ...d,
      archivos: [
        ...d.archivos.filter((a) => ![10, 12, 14, 15].includes(a.id)),
        archivo(
          31,
          'Formulario N°1 - Identificación del oferente - lleno.docx',
          {
            viene_de: 6,
            generacion_id: 5,
            creado_en: '2026-10-19T14:00:00.000Z',
          },
        ),
        archivo(32, 'Formulario N°3 - Experiencia - lleno.docx', {
          viene_de: 6,
          generacion_id: 5,
          creado_en: '2026-10-19T14:00:01.000Z',
        }),
        archivo(
          33,
          'Formulario N°1 - Identificación del oferente - firmado.pdf',
          {
            origen: 'firmado',
            viene_de: 31,
            creado_en: '2026-10-19T14:10:00.000Z',
          },
        ),
      ],
      inicioDe: new Map([...d.inicioDe, [5, '2026-10-19T13:59:00.000Z']]),
    });
    expect(
      pieza(set, 'Formulario N°1 - Identificación del oferente - firmado.pdf'),
    ).toMatchObject({
      carpetas: ['administrativa'],
      aviso: null,
      // El texto (para los respaldos) se lee de su Word.
      texto: {
        ruta: 'c1/oportunidades/40/x_31',
        nombre: 'Formulario N°1 - Identificación del oferente - lleno.docx',
      },
    });
    expect(
      pieza(set, 'Formulario N°3 - Experiencia - lleno.docx'),
    ).toMatchObject({ carpetas: ['tecnica'], aviso: 'sin firma' });
  });

  it('se firma y se borra (decisión 58): el PDF firmado solo va a la carpeta de su formulario, y avisa si se firmó con otro precio', () => {
    const d = datos();
    const set = armarElSet({
      ...d,
      // Los Word se borraron al firmar: quedan sus PDF, con el archivo del
      // comprador y la corrida de su Word.
      archivos: [
        ...d.archivos.filter((a) => a.seccion === 'bases' || a.id === 40),
        archivo(
          33,
          'Formulario N°1 - Identificación del oferente - firmado.pdf',
          { origen: 'firmado', viene_de: 6, generacion_id: 5 },
        ),
        archivo(36, 'Formulario N°3 - Experiencia - firmado.pdf', {
          origen: 'firmado',
          viene_de: 6,
          generacion_id: 5,
        }),
        archivo(34, 'Anexo N°5 - Oferta económica - firmado.pdf', {
          origen: 'firmado',
          viene_de: 4,
          generacion_id: 5,
        }),
        archivo(35, 'Propuesta técnica 1532886-5-LE26 - firmado.pdf', {
          origen: 'firmado',
          viene_de: null,
          generacion_id: 4,
        }),
      ],
      precio: 15_900_000,
      precioDe: new Map([[5, 14_000_000]]),
    });
    expect(
      pieza(set, 'Formulario N°1 - Identificación del oferente - firmado.pdf'),
    ).toMatchObject({
      carpetas: ['administrativa'],
      aviso: null,
      // Su texto se busca por la ruta del PDF (quedó guardado al firmar).
      texto: { ruta: 'c1/oportunidades/40/x_33' },
    });
    expect(
      pieza(set, 'Formulario N°3 - Experiencia - firmado.pdf'),
    ).toMatchObject({ carpetas: ['tecnica'], aviso: null });
    expect(
      pieza(set, 'Anexo N°5 - Oferta económica - firmado.pdf'),
    ).toMatchObject({
      carpetas: ['economica'],
      aviso: 'firmado con otro precio',
    });
    expect(
      pieza(set, 'Propuesta técnica 1532886-5-LE26 - firmado.pdf'),
    ).toMatchObject({ carpetas: ['tecnica'], que_es: 'propuesta' });
    expect(set.faltan.join(' ')).not.toContain('va sin firma');
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

  it('lo general para contratar va en «4. Otros», salvo lo que las bases ya piden en la administrativa (decisión 38)', () => {
    const d = datos();
    const set = armarElSet({
      ...d,
      archivos: [
        ...d.archivos,
        archivo(41, 'E-rut Quillon.pdf', { origen: 'subido' }),
      ],
      carpeta: [
        ...d.carpeta,
        documento(7, 'erut', 'e-RUT.pdf'),
        documento(8, 'estatutos', 'Estatutos 2019.pdf'),
        documento(9, 'vigencia', 'Certificado de vigencia.pdf', {
          vence: '2026-10-10',
        }),
      ],
    });
    // El e-RUT subido a mano va en «4. Otros», y el de la carpeta no se
    // repite.
    expect(pieza(set, 'E-rut Quillon.pdf')).toMatchObject({
      carpetas: ['otros'],
      que_es: 'subido',
    });
    expect(pieza(set, 'e-RUT.pdf')).toBeUndefined();
    expect(pieza(set, 'Estatutos 2019.pdf')).toMatchObject({
      carpetas: ['otros'],
      que_es: 'documento',
    });
    expect(pieza(set, 'Certificado de vigencia.pdf')).toMatchObject({
      carpetas: ['otros'],
      aviso: 'vencido el 10-10-2026',
    });
    // La patente la piden las bases: va en la administrativa (subida a
    // mano), no en «4. Otros».
    expect(pieza(set, 'Patente 2026.pdf')).toMatchObject({
      carpetas: ['administrativa'],
    });
    expect(pieza(set, 'Patente vieja.pdf')).toBeUndefined();
    expect(set.faltan).toEqual(
      expect.arrayContaining([
        '«Certificado de vigencia de la sociedad» venció el 10-10-2026: súbelo renovado en «Mi empresa».',
      ]),
    );
    // Lo que falta (la no quiebra) no se avisa si las bases no lo nombran.
    expect(set.faltan.join(' ')).not.toContain('Para contratar');
    // Si lo nombran (en su checklist de documentos), se dice una vez.
    const nombrada = armarElSet({
      ...d,
      carpeta: [...d.carpeta, documento(7, 'erut', 'e-RUT.pdf')],
      documentos: [
        { nombre: 'Certificado de no quiebra' },
        { nombre: 'Copia del e-RUT' },
      ],
    });
    expect(nombrada.faltan).toContain(
      'Para contratar te pueden pedir «Certificado de no quiebra»: súbelos en «Mi empresa» y van en «4. Otros».',
    );
    expect(
      rutasEnElZip(set.piezas.filter((p) => p.nombre === 'Estatutos 2019.pdf')),
    ).toEqual([['4. Otros/Estatutos 2019.pdf']]);
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

  it('si el anexo que los nombra va firmado en PDF, los respaldos van dentro de su PDF (19-10: un solo PDF)', () => {
    const d = datos();
    const set = armarElSet(d);
    const firmado = {
      nombre: 'Formulario N°3 - Experiencia - firmado.pdf',
      ruta: 'c1/postulacion/99',
      bytes: 500,
      carpetas: ['tecnica' as const],
      que_es: 'formulario' as const,
      aviso: null,
    };
    const conElFirmado = { ...set, piezas: [...set.piezas, firmado] };
    const r = conLosRespaldos(
      conElFirmado,
      [
        {
          texto: 'Formulario N°3 | N° 4352-103-SE23 | 2023',
          carpetas: ['tecnica'],
          pieza: firmado,
        },
      ],
      d,
    );
    expect(r.piezas.filter((p) => p.que_es === 'respaldo')).toEqual([]);
    expect(r.piezas.find((p) => p.nombre === firmado.nombre)).toMatchObject({
      adjuntos: [
        { nombre: 'OC 4352-103-SE23.pdf', ruta: 'c1/oferente/documentos/5' },
      ],
      aviso: 'con su respaldo adentro',
    });
  });

  it('si piden experiencia y no hay respaldos, lo dice', () => {
    const d = datos();
    const sinRespaldos = {
      ...d,
      carpeta: d.carpeta.filter((x) => x.tipo !== 'respaldo_experiencia'),
    };
    const set = conLosRespaldos(armarElSet(sinRespaldos), [], sinRespaldos);
    expect(set.faltan).toContain(
      'Las bases piden experiencia: sube sus órdenes de compra o facturas como «Respaldo de experiencia» en «Mi empresa», o a cada evento en Post-venta, y vuelve a armar la postulación.',
    );
  });

  it('el respaldo de la patente va siempre donde va la patente, justo detrás (decisión 61)', () => {
    const d = datos();
    const contrato = documento(
      42,
      'respaldo_patente',
      'Comodato de arriendo.pdf',
    );
    // Las bases la piden y se subió a mano: detrás de ella, en la
    // administrativa.
    const pedida = armarElSet({ ...d, carpeta: [...d.carpeta, contrato] });
    expect(pieza(pedida, 'Comodato de arriendo.pdf')).toMatchObject({
      carpetas: ['administrativa'],
      que_es: 'documento',
      aviso: null,
    });
    const nombres = pedida.piezas.map((p) => p.nombre);
    expect(nombres.indexOf('Comodato de arriendo.pdf')).toBe(
      nombres.indexOf('Patente 2026.pdf') + 1,
    );
    // No la piden: la patente de la carpeta va en «4. Otros», y el contrato
    // con ella.
    const sinSubir = d.archivos.filter((a) => a.nombre !== 'Patente 2026.pdf');
    const noPedida = armarElSet({
      ...d,
      archivos: sinSubir,
      requisitos: d.requisitos.filter((r) => !/patente/i.test(r.que)),
      carpeta: [...d.carpeta, contrato],
    });
    expect(pieza(noPedida, 'Patente vieja.pdf')).toMatchObject({
      carpetas: ['otros'],
    });
    expect(pieza(noPedida, 'Comodato de arriendo.pdf')).toMatchObject({
      carpetas: ['otros'],
    });
    // Sin patente en el set, el contrato no va solo.
    const sinPatente = armarElSet({
      ...d,
      archivos: sinSubir,
      carpeta: [...d.carpeta.filter((x) => x.tipo !== 'patente'), contrato],
    });
    expect(pieza(sinPatente, 'Comodato de arriendo.pdf')).toBeUndefined();
    // Otro tipo («otro») nunca va solo.
    const comoOtro = armarElSet({
      ...d,
      carpeta: [...d.carpeta, { ...contrato, tipo: 'otro' }],
    });
    expect(pieza(comoOtro, 'Comodato de arriendo.pdf')).toBeUndefined();
  });

  it('el respaldo de la patente ya subido a mano no se repite, y el vencido avisa (decisión 61)', () => {
    const d = datos();
    const set = armarElSet({
      ...d,
      archivos: [
        ...d.archivos,
        archivo(43, 'd2_Declaracion_de_uso_de_patente.pdf', {
          origen: 'subido',
        }),
      ],
      carpeta: [
        ...d.carpeta,
        documento(44, 'respaldo_patente', 'Declaración de uso de patente.pdf'),
        documento(45, 'respaldo_patente', 'Dictamen de Contraloría.pdf', {
          vence: '2026-10-01',
        }),
      ],
    });
    expect(pieza(set, 'Declaración de uso de patente.pdf')).toBeUndefined();
    expect(pieza(set, 'd2_Declaracion_de_uso_de_patente.pdf')).toMatchObject({
      carpetas: ['administrativa'],
    });
    expect(pieza(set, 'Dictamen de Contraloría.pdf')).toMatchObject({
      carpetas: ['administrativa'],
      aviso: 'vencido el 01-10-2026',
    });
    expect(set.faltan).toContain(
      '«Dictamen de Contraloría.pdf» venció el 01-10-2026: súbelo renovado en «Mi empresa».',
    );
  });

  it('los respaldos de Post-venta que leyeron los anexos van igual, desde su evento, sin repetir un número de la carpeta (decisión 45)', () => {
    const d = {
      ...datos(),
      postVenta: [
        {
          numero: '5040-126-TD26',
          nombre: 'Orden de compra 5040-126-TD26.pdf',
          ruta: 'c1/event-documents/q-473/ordenes_compra/x_5040-126-TD26.pdf',
          bytes: 900,
        },
        // El mismo número que uno de la carpeta: va el de la carpeta.
        {
          numero: '4352-103-se23',
          nombre: 'Orden de compra 4352-103-SE23.pdf',
          ruta: 'c1/event-documents/q-300/ordenes_compra/x.pdf',
          bytes: 800,
        },
      ],
    };
    const set = conLosRespaldos(
      armarElSet(d),
      [
        {
          texto:
            'Formulario N°3 | N° 4352-103-SE23 | 2023 | N° 5040-126-TD26 | 2026',
          carpetas: ['tecnica'],
        },
      ],
      d,
    );
    expect(
      set.piezas
        .filter((p) => p.que_es === 'respaldo')
        .map((p) => [p.nombre, p.ruta]),
    ).toEqual([
      ['OC 4352-103-SE23.pdf', 'c1/oferente/documentos/5'],
      [
        'Orden de compra 5040-126-TD26.pdf',
        'c1/event-documents/q-473/ordenes_compra/x_5040-126-TD26.pdf',
      ],
    ]);
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
