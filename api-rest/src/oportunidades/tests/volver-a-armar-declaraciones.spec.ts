import type { ArchivoDelSet } from '../postulacion/el-set';
import { laVueltaAnterior } from '../postulacion/volver-a-armar';

// «VOLVER A ARMAR» CON LOS PAPELES DE LA PARTE 3B (decisión 119, 08-11).
// Desde la parte 3b la cotización, la propuesta y las declaraciones llevan
// el nombre que les dan las bases: se reconocen por el trabajo que las
// hizo. Lo firmado o subido a mano no se rehace; cada borrador lo reemplaza
// lo suyo, y nunca lo de otro.

const archivo = (
  id: number,
  nombre: string,
  extra: Partial<ArchivoDelSet> = {},
): ArchivoDelSet => ({
  id,
  nombre,
  ruta: `c1/oportunidades/323/postulacion/x_${id}`,
  bytes: 1000,
  seccion: 'postulacion',
  origen: 'generado',
  viene_de: null,
  generacion_id: 105,
  creado_en: '2026-11-08T11:00:00.000Z',
  ...extra,
});

/** 105 y 99: ofertas; 106: la propuesta. */
const TIPO_DE = new Map([
  [99, 'oferta'],
  [105, 'oferta'],
  [106, 'propuesta'],
]);

const vuelta = (postulacion: ArchivoDelSet[], precioAnterior = 1_780_000) =>
  laVueltaAnterior({
    postulacion,
    formularios: [],
    total: 1_780_000,
    totalDe: new Map(),
    precioAnterior,
    tipoDe: TIPO_DE,
  });

describe('Volver a armar con los papeles de la parte 3b', () => {
  it('cada borrador lo reemplaza lo suyo: la cotización, la propuesta y las declaraciones, con el nombre de las bases', () => {
    const v = vuelta([
      archivo(30, 'Especificaciones y detalle del servicio 4362-30-LE26.docx', {
        generacion_id: 106,
      }),
      archivo(31, 'Oferta económica por línea 4362-30-LE26.docx'),
      archivo(
        32,
        'Declaración jurada con la ubicación del local 4362-30-LE26.docx',
      ),
      archivo(
        33,
        'Formato N°1 - Identificación del oferente 4362-30-LE26.docx',
        {
          generacion_id: 99,
        },
      ),
    ]);
    expect(v).toMatchObject({
      borradoresDePropuesta: [30],
      borradoresDeCotizacion: [31],
      borradoresDeDeclaraciones: [32, 33],
      declaracionesHechas: [],
      cotizacion: 'no_hay',
      propuestaFirmada: false,
    });
  });

  it('lo firmado no se rehace: la declaración, la propuesta y la cotización con el nombre de las bases', () => {
    const v = vuelta([
      archivo(
        40,
        'Especificaciones y detalle del servicio 4362-30-LE26 - firmado.pdf',
        { origen: 'firmado', generacion_id: 106 },
      ),
      archivo(41, 'Oferta económica por línea 4362-30-LE26 - firmado.pdf', {
        origen: 'firmado',
      }),
      archivo(
        42,
        'Declaración jurada con la ubicación del local 4362-30-LE26 - firmado.pdf',
        { origen: 'firmado' },
      ),
      // Subida a mano: tampoco se rehace.
      archivo(43, 'Datos bancarios.pdf', {
        origen: 'subido',
        generacion_id: null,
      }),
    ]);
    expect(v).toMatchObject({
      propuestaFirmada: true,
      cotizacion: 'firmada',
      declaracionesHechas: ['ubicacion', 'banco'],
      borradoresDePropuesta: [],
      borradoresDeCotizacion: [],
      borradoresDeDeclaraciones: [],
    });
  });

  it('la cotización firmada con otro precio se rehace', () => {
    const v = vuelta(
      [
        archivo(41, 'Oferta económica por línea 4362-30-LE26 - firmado.pdf', {
          origen: 'firmado',
        }),
      ],
      1_500_000,
    );
    expect(v.cotizacion).toBe('otro_precio');
  });

  it('un firmado cuyo Word sigue ahí se reconoce por el Word', () => {
    const v = vuelta([
      archivo(
        50,
        'Formato N°1 - Identificación del oferente 4362-30-LE26.docx',
      ),
      archivo(
        51,
        'Formato N°1 - Identificación del oferente 4362-30-LE26 - firmado.pdf',
        {
          origen: 'firmado',
          viene_de: 50,
          generacion_id: 107,
        },
      ),
    ]);
    expect(v).toMatchObject({
      declaracionesHechas: ['identificacion'],
      // Su Word no se toca: su firmado lo necesita.
      borradoresDeDeclaraciones: [],
      propuestaFirmada: false,
    });
  });
});
