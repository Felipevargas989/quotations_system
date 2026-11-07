import {
  type ArchivoDelSet,
  armarElSet,
  type DatosDelSet,
} from '../postulacion/el-set';

// LA COTIZACIÓN DETALLADA EN EL SET (decisión 119, 07-11): la que arma el
// motor va en la económica y aparte de la propuesta técnica; nace de su
// oferta y queda vieja solo con otra más nueva; si las bases la piden y no
// va, se avisa.

const archivo = (
  id: number,
  nombre: string,
  extra: Partial<ArchivoDelSet> = {},
): ArchivoDelSet => ({
  id,
  nombre,
  ruta: `c1/oportunidades/11072/x_${id}`,
  bytes: 1000,
  seccion: 'postulacion',
  origen: 'generado',
  viene_de: null,
  generacion_id: null,
  creado_en: '2026-11-07T11:00:00.000Z',
  ...extra,
});

const PEDIDA = [
  {
    nombre:
      'Cotización detallada (con plazo de entrega, detalle de lo ofertado y datos bancarios)',
    parte: 'economica',
    cuando: 'con_la_oferta',
    carpeta: 'otro',
    obligatorio: true,
  },
];

const datos = (extra: Partial<DatosDelSet> = {}): DatosDelSet => ({
  archivos: [
    archivo(30, 'Propuesta técnica 2705-1740-COT26.docx', {
      generacion_id: 106,
    }),
    archivo(31, 'Cotización detallada 2705-1740-COT26.docx', {
      generacion_id: 105,
    }),
  ],
  formularios: [],
  requisitos: [],
  documentos: PEDIDA,
  carpeta: [],
  inicioDe: new Map([
    [105, '2026-11-07T10:58:00.000Z'],
    [106, '2026-11-07T11:00:00.000Z'],
  ]),
  ofertaLista: '2026-11-07T10:59:00.000Z',
  ofertaId: 105,
  corte: '2026-11-07',
  ...extra,
});

describe('la cotización detallada en el set', () => {
  it('va en la económica, aparte de la propuesta, y no queda vieja por su propia oferta', () => {
    const set = armarElSet(datos());
    expect(
      set.piezas.map((p) => [p.nombre, p.carpetas, p.que_es, p.aviso]),
    ).toEqual([
      [
        'Propuesta técnica 2705-1740-COT26.docx',
        ['tecnica'],
        'propuesta',
        'sin firma',
      ],
      [
        'Cotización detallada 2705-1740-COT26.docx',
        ['economica'],
        'cotizacion',
        'sin firma',
      ],
    ]);
    expect(set.faltan.join(' ')).not.toContain('antes de la última oferta');
    expect(set.faltan.join(' ')).not.toContain(
      'Las bases piden una cotización detallada',
    );
  });

  it('con otra oferta más nueva queda vieja; firmada, va su PDF', () => {
    const vieja = armarElSet(datos({ ofertaId: 120 }));
    expect(
      vieja.piezas.find((p) => p.que_es === 'cotizacion')?.aviso,
    ).toContain('se hizo antes de la última oferta');
    const firmada = armarElSet(
      datos({
        archivos: [
          archivo(32, 'Cotización detallada 2705-1740-COT26 - firmado.pdf', {
            origen: 'firmado',
            generacion_id: 109,
          }),
        ],
      }),
    );
    expect(firmada.piezas).toEqual([
      expect.objectContaining({
        nombre: 'Cotización detallada 2705-1740-COT26 - firmado.pdf',
        carpetas: ['economica'],
        que_es: 'cotizacion',
        aviso: null,
      }),
    ]);
  });

  it('si las bases la piden y no va, se avisa; subida a mano, no', () => {
    const sin = armarElSet(
      datos({ archivos: [archivo(30, 'Propuesta técnica 2705.docx')] }),
    );
    expect(sin.faltan).toContain(
      'Las bases piden una cotización detallada: vincula tu cotización y vuelve a armar la postulación, o súbela hecha a «Mi postulación».',
    );
    const subida = armarElSet(
      datos({
        archivos: [
          archivo(33, 'Cotización oferta económica.pdf', { origen: 'subido' }),
        ],
      }),
    );
    expect(subida.faltan.join(' ')).not.toContain(
      'Las bases piden una cotización detallada',
    );
    // Lo subido a mano que dice «cotización» va en la económica.
    expect(subida.piezas[0].carpetas).toEqual(['economica']);
  });
});
