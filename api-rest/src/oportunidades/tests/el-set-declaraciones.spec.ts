import type { DocumentoDeEmpresa } from '../oferente/oferente.repository';
import {
  type ArchivoDelSet,
  armarElSet,
  type DatosDelSet,
} from '../postulacion/el-set';

// LOS PAPELES SIN FORMATO EN EL SET (decisión 119, parte 3b, 08-11). Desde
// la parte 3b la cotización, la propuesta y cada declaración llevan el
// nombre que les dan las bases: el set las reconoce por el trabajo que las
// hizo. Cada declaración va en la parte en que la piden las bases; lo del
// portal no se sube; lo que sube la empresa se dice en una sola línea; y la
// «patente» de un vehículo no es la patente municipal.

const archivo = (
  id: number,
  nombre: string,
  extra: Partial<ArchivoDelSet> = {},
): ArchivoDelSet => ({
  id,
  nombre,
  ruta: `c1/oportunidades/323/x_${id}`,
  bytes: 1000,
  seccion: 'postulacion',
  origen: 'generado',
  viene_de: null,
  generacion_id: null,
  creado_en: '2026-11-08T11:00:00.000Z',
  ...extra,
});

const enLaCarpeta = (
  id: number,
  tipo: string,
  nombre: string,
): DocumentoDeEmpresa => ({
  id,
  tipo,
  nombre,
  ruta: `c1/empresa/${id}`,
  tipo_archivo: 'application/pdf',
  bytes: 500,
  vence: null,
  datos: null,
  creado_en: '2026-10-01T12:00:00.000Z',
  quien: null,
});

const doc = (nombre: string, parte: string, obligatorio = true) => ({
  nombre,
  parte,
  cuando: 'con_la_oferta',
  carpeta: 'otro',
  obligatorio,
});

const OFERTA_ECONOMICA =
  'Oferta económica con valor del salón por jornada y de coffee break y almuerzo por persona';
const ESPECIFICACIONES =
  'Especificaciones y detalle del servicio (espacios, menú de desayuno, almuerzo y once, entradas, horario)';
const FOTOS = 'Fotografías del salón, áreas verdes, estacionamiento y baños';
const VEHICULO =
  'Identificación del vehículo (marca, modelo, año, patente y capacidad)';

const datos = (extra: Partial<DatosDelSet> = {}): DatosDelSet => ({
  archivos: [
    archivo(30, 'Especificaciones y detalle del servicio 4362-30-LE26.docx', {
      generacion_id: 106,
    }),
    archivo(31, `${OFERTA_ECONOMICA} 4362-30-LE26.docx`, {
      generacion_id: 105,
    }),
    archivo(
      32,
      'Declaración jurada con la ubicación del local 4362-30-LE26.docx',
      {
        generacion_id: 105,
      },
    ),
    // Firmada: desde la decisión 58 el PDF queda solo, con la corrida de
    // su Word.
    archivo(
      33,
      'Formato N°1 - Identificación del oferente 4362-30-LE26 - firmado.pdf',
      { origen: 'firmado', generacion_id: 105 },
    ),
    // De una oferta anterior.
    archivo(34, 'Datos bancarios para el pago 4362-30-LE26.docx', {
      generacion_id: 99,
    }),
  ],
  formularios: [
    {
      nombre: 'Formato N°1 - Identificación del oferente',
      archivo: '',
      aplica: true,
      se_entrega_en: 'administrativa',
    },
    {
      nombre: 'ANEXO N° 2 FORMULARIO PROGRAMA DE INTEGRIDAD',
      archivo: '',
      aplica: true,
      se_entrega_en: 'administrativa',
    },
  ],
  requisitos: [],
  documentos: [
    doc('Declaración jurada con la ubicación del local', 'tecnica', false),
    doc('Datos bancarios para el pago', 'economica'),
    doc(OFERTA_ECONOMICA, 'economica'),
    doc(ESPECIFICACIONES, 'tecnica'),
    doc(FOTOS, 'tecnica'),
    doc(VEHICULO, 'tecnica'),
    doc('Declaración jurada de requisitos para ofertar', 'administrativa'),
  ],
  carpeta: [
    enLaCarpeta(1, 'programa_integridad', 'Programa de integridad.pdf'),
    enLaCarpeta(2, 'patente', 'Patente 2026.pdf'),
  ],
  inicioDe: new Map([
    [99, '2026-11-01T10:00:00.000Z'],
    [105, '2026-11-08T10:58:00.000Z'],
    [106, '2026-11-08T11:00:00.000Z'],
  ]),
  tipoDe: new Map([
    [99, 'oferta'],
    [105, 'oferta'],
    [106, 'propuesta'],
  ]),
  ofertaLista: '2026-11-08T10:59:00.000Z',
  ofertaId: 105,
  corte: '2026-11-08',
  ...extra,
});

describe('los papeles sin formato en el set (decisión 119, parte 3b)', () => {
  it('cada uno reconocido por su trabajo y en la parte en que lo piden las bases', () => {
    const set = armarElSet(datos());
    expect(
      set.piezas.map((p) => [p.nombre, p.carpetas, p.que_es, p.aviso]),
    ).toEqual([
      [
        'Especificaciones y detalle del servicio 4362-30-LE26.docx',
        ['tecnica'],
        'propuesta',
        'sin firma',
      ],
      [
        `${OFERTA_ECONOMICA} 4362-30-LE26.docx`,
        ['economica'],
        'cotizacion',
        'sin firma',
      ],
      [
        'Declaración jurada con la ubicación del local 4362-30-LE26.docx',
        ['tecnica'],
        'declaracion',
        'sin firma',
      ],
      [
        'Formato N°1 - Identificación del oferente 4362-30-LE26 - firmado.pdf',
        ['administrativa'],
        'declaracion',
        null,
      ],
      [
        'Datos bancarios para el pago 4362-30-LE26.docx',
        ['economica'],
        'declaracion',
        'sin firma · se hizo antes de la última oferta',
      ],
      // El «Anexo N°2» sin su formato se cumple con el programa de la
      // carpeta.
      ['Programa de integridad.pdf', ['administrativa'], 'documento', null],
      // La patente del vehículo no es la municipal: la patente va solo
      // como lo general para contratar, en «4. Otros» (decisión 38).
      ['Patente 2026.pdf', ['otros'], 'documento', null],
    ]);
  });

  it('lo que falta: lo que arma Eventia, uno por uno; lo que subes tú, en una línea; lo del portal, nada', () => {
    const set = armarElSet(datos());
    expect(set.faltan).toEqual([
      '«Especificaciones y detalle del servicio 4362-30-LE26.docx» va sin firma: usa «Firmar» si el formulario la pide.',
      `«${OFERTA_ECONOMICA} 4362-30-LE26.docx» va sin firma: usa «Firmar» si el formulario la pide.`,
      '«Declaración jurada con la ubicación del local 4362-30-LE26.docx» va sin firma: usa «Firmar» si el formulario la pide.',
      '«Datos bancarios para el pago 4362-30-LE26.docx» va sin firma: usa «Firmar» si el formulario la pide.',
      '«Datos bancarios para el pago 4362-30-LE26.docx» se hizo antes de la última oferta: vuelve a generarlo.',
      `Te faltan 2 papeles que subes tú a «Mi postulación»: «${FOTOS}» (son tus fotos), «${VEHICULO}» (es del vehículo).`,
    ]);
  });

  it('sin lo que arma Eventia, dice que hay que volver a armar; lo subido a mano con su nombre cuenta', () => {
    const set = armarElSet(
      datos({
        archivos: [
          archivo(40, 'Datos bancarios.pdf', { origen: 'subido' }),
          archivo(41, 'Fotos del salón.pdf', { origen: 'subido' }),
        ],
      }),
    );
    expect(set.faltan).toEqual([
      'Falta «Especificaciones y detalle del servicio (espacios, menú de desayuno, almuerzo y once, entradas, horario)»: va en la propuesta técnica; vuelve a armar la postulación.',
      'Falta «Formato N°1 - Identificación del oferente»: la arma Eventia al armar la postulación; vuelve a armarla.',
      `Te falta subir a «Mi postulación»: «${VEHICULO}» (es del vehículo).`,
      'Las bases piden una cotización: vuelve a armar la postulación (la arma Eventia con lo postulado, o con tu cotización si la vinculas), o súbela hecha a «Mi postulación».',
    ]);
  });

  it('sin el tipo de cada trabajo (datos de antes), la cotización se reconoce por su nombre, como siempre', () => {
    const set = armarElSet(
      datos({
        tipoDe: undefined,
        archivos: [
          archivo(31, 'Cotización detallada 4362-30-LE26.docx', {
            generacion_id: 105,
          }),
        ],
      }),
    );
    expect(set.piezas[0]).toMatchObject({
      que_es: 'cotizacion',
      carpetas: ['economica'],
    });
  });
});
