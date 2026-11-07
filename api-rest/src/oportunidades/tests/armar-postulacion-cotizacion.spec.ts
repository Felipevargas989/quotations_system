import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { GeneracionService } from '../generacion/generacion.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { ArmarLaOfertaService } from '../postulacion/armar-la-oferta.service';
import { ArmarPostulacionService } from '../postulacion/armar-postulacion.service';
import type { CotizacionDeLaPostulacionService } from '../postulacion/cotizacion-de-la-postulacion.service';
import type { LaCotizacionDetalladaService } from '../postulacion/la-cotizacion-detallada.service';
import type { LaExperienciaService } from '../postulacion/la-experiencia.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// «ARMAR POSTULACIÓN» ARMA TAMBIÉN LA COTIZACIÓN DETALLADA (decisión 119,
// 07-11). Felipe: "todos los documentos debieron generarse". Si las bases
// la piden, después de la oferta, junto con lo demás; lo subido a mano
// manda y la firmada con el mismo precio se queda.

const USUARIO = {
  id: 'cuenta-1',
  company_id: 1,
  role: 'administrador',
} as unknown as User;

const COMPRA_AGIL = {
  requisitos: [],
  formularios: [],
  documentos: [
    {
      nombre:
        'Cotización detallada (con plazo de entrega, detalle de lo ofertado y datos bancarios)',
      parte: 'economica',
      cuando: 'con_la_oferta',
      carpeta: 'otro',
      obligatorio: true,
    },
  ],
};

const archivo = (id: number, nombre: string, origen: string) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/11072/postulacion/${id}`,
  bytes: 100,
  seccion: 'postulacion',
  origen,
  viene_de: null,
  generacion_id: origen === 'generado' ? 100 : null,
  creado_en: '2026-11-06T22:44:00.000Z',
});

/** La cotización vinculada: un salón y un almuerzo para 20, $500.000. */
const LA_VINCULADA = {
  id: 'd5dee709',
  quotation_number: 574,
  quotation_status: 'solicitada',
  people_count: 20,
  children_count: null,
  event_date: '2026-11-11',
  event_end_date: null,
  subtotal_amount: 500_000,
  discount_amount: 0,
  total_amount: 500_000,
  client: null,
  items: {
    fixed_services: [
      { day: 1, nombre: 'Salón auditorio', precio: 250_000, quantity: 1 },
    ],
    variable_services: [
      {
        day: 1,
        people: 20,
        category: 'Almuerzo',
        items: [{ nombre: 'Carne mechada', precio: 12_500, quantity: 1 }],
      },
    ],
  },
};

function armar(
  extra: {
    archivos?: unknown[];
    trabajos?: unknown[];
    conDetallada?: boolean;
    tipo?: string;
  } = {},
) {
  const oferta = {
    pedir: jest.fn().mockResolvedValue({ id: 105, estado: 'procesando' }),
  };
  const documentos = {
    generarAnexos: jest.fn().mockResolvedValue({ id: 106 }),
    crearPropuesta: jest.fn().mockResolvedValue({ id: 107 }),
  };
  const generaciones = {
    anotarParametros: jest.fn().mockResolvedValue(undefined),
  };
  const analisis = {
    ultimo: jest
      .fn()
      .mockResolvedValue({ estado: 'listo', resultado: COMPRA_AGIL }),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut: '77.701.305-K',
    }),
  };
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({
      id: 11072,
      quotation_id: 'd5dee709',
      proceso: { tipo: extra.tipo ?? 'compra_agil' },
    }),
    cotizacion: jest.fn().mockResolvedValue(LA_VINCULADA),
    archivosDelSet: jest.fn().mockResolvedValue(extra.archivos ?? []),
    trabajosDeLaIA: jest.fn().mockResolvedValue(extra.trabajos ?? []),
  };
  const adjuntos = { borrarBorradores: jest.fn().mockResolvedValue(0) };
  const experiencia = { paraArmar: jest.fn().mockResolvedValue(null) };
  const detallada = { armar: jest.fn().mockResolvedValue({ id: 500 }) };
  const servicio = new ArmarPostulacionService(
    oferta as unknown as ArmarLaOfertaService,
    documentos as unknown as GeneracionService,
    {} as unknown as CotizacionDeLaPostulacionService,
    generaciones as unknown as GeneracionRepository,
    analisis as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    repo as unknown as PostulacionRepository,
    experiencia as unknown as LaExperienciaService,
    adjuntos as unknown as AdjuntosRepository,
    mockPinoLogger() as unknown as PinoLogger,
    extra.conDetallada === false
      ? undefined
      : (detallada as unknown as LaCotizacionDetalladaService),
  );
  return { servicio, oferta, documentos, generaciones, detallada, repo };
}

/** «Armar postulación» y lo que sigue cuando la oferta quedó lista. */
const armarYSeguir = async (s: ReturnType<typeof armar>, total: number) => {
  await s.servicio.armar(USUARIO, 11072, total);
  const [, , , encadenar] = s.oferta.pedir.mock.calls[0] as [
    number,
    string,
    number,
    { despues: (id: number) => Promise<void> },
  ];
  await encadenar.despues(105);
};

describe('Armar postulación arma la cotización detallada', () => {
  it('si las bases la piden, la arma con el precio, la oferta y la propuesta (decisión 94: sin anexos en una compra ágil sin formularios)', async () => {
    const s = armar({
      archivos: [
        archivo(90, 'Cotización detallada 2705-1740-COT26.docx', 'generado'),
      ],
    });
    await armarYSeguir(s, 1_780_000);
    expect(s.detallada.armar).toHaveBeenCalledWith(
      USUARIO,
      11072,
      105,
      1_780_000,
      { conPropuesta: true, reemplaza: [90], reparto: expect.any(Array) },
    );
    expect(s.documentos.crearPropuesta).toHaveBeenCalled();
    expect(s.documentos.generarAnexos).not.toHaveBeenCalled();
    // Sin problemas: nada anotado.
    expect(s.generaciones.anotarParametros).not.toHaveBeenCalled();
  });

  it('si no se pudo, queda anotado en palabras con lo demás', async () => {
    const s = armar();
    s.detallada.armar.mockRejectedValue(
      new Error(
        'Las bases piden una cotización detallada: vincula tu cotización',
      ),
    );
    await armarYSeguir(s, 1_780_000);
    expect(s.generaciones.anotarParametros).toHaveBeenCalledWith(1, 105, {
      postulacion: expect.objectContaining({
        problemas: [
          'La cotización detallada: Las bases piden una cotización detallada: vincula tu cotización',
        ],
      }),
    });
  });

  it('la subida a mano manda, y la firmada con el mismo precio se queda', async () => {
    const subida = armar({
      archivos: [
        archivo(
          92,
          'Cotización detallada oferta económica 2705-1740-COT26.docx',
          'subido',
        ),
      ],
    });
    await armarYSeguir(subida, 1_780_000);
    expect(subida.detallada.armar).not.toHaveBeenCalled();

    const anterior = {
      id: 100,
      tipo: 'oferta',
      estado: 'listo',
      creado_en: '2026-11-06T22:43:00.000Z',
      terminado_en: '2026-11-06T22:44:00.000Z',
      parametros: { postulacion: { total: 1_780_000, propuesta: true } },
    };
    const firmada = archivo(
      91,
      'Cotización detallada 2705-1740-COT26 - firmado.pdf',
      'firmado',
    );
    const igual = armar({ archivos: [firmada], trabajos: [anterior] });
    await armarYSeguir(igual, 1_780_000);
    expect(igual.detallada.armar).not.toHaveBeenCalled();

    // Con otro precio se rehace y se avisa que la firmada quedó vieja.
    const otro = armar({ archivos: [firmada], trabajos: [anterior] });
    await armarYSeguir(otro, 1_700_000);
    expect(otro.detallada.armar).toHaveBeenCalled();
    expect(otro.generaciones.anotarParametros).toHaveBeenCalledWith(1, 105, {
      postulacion: expect.objectContaining({
        problemas: [
          'La cotización detallada firmada tiene el precio de antes: firma la nueva y borra la anterior.',
        ],
      }),
    });
  });

  it('el precio se reparte una sola vez sobre la vinculada y las mismas cifras van a la cotización y a los formularios (Felipe, 07-11)', async () => {
    // Una licitación: con formularios que llenar.
    const s = armar({ tipo: 'licitacion' });
    await armarYSeguir(s, 600_000);
    const [, , , , cotizacion] = s.detallada.armar.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
      { reparto: Array<{ lineas: Array<{ unitario: number }> }> },
    ];
    const [, , , anexos] = s.documentos.generarAnexos.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      { monto_total: number; reparto: unknown },
    ];
    expect(anexos.monto_total).toBe(600_000);
    expect(anexos.reparto).toBe(cotizacion.reparto);
    // $500.000 hasta $600.000: todo sube un 20 %.
    expect(cotizacion.reparto[0].lineas.map((l) => l.unitario)).toEqual([
      300_000, 15_000,
    ]);
  });

  it('sin cotización vinculada no hay reparto: los formularios dejan el precio por ítem pendiente, como antes', async () => {
    const s = armar({ tipo: 'licitacion' });
    s.repo.oportunidad.mockResolvedValue({
      id: 11072,
      quotation_id: null,
      proceso: { tipo: 'licitacion' },
    });
    await armarYSeguir(s, 600_000);
    const [, , , anexos] = s.documentos.generarAnexos.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      Record<string, unknown>,
    ];
    expect(anexos).not.toHaveProperty('reparto');
    expect(s.repo.cotizacion).not.toHaveBeenCalled();
  });

  it('si las bases no la piden, no se arma', async () => {
    const s = armar();
    const { servicio } = s;
    const sinPedirla = servicio as unknown as {
      analisis: { ultimo: jest.Mock };
    };
    sinPedirla.analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: { ...COMPRA_AGIL, documentos: [] },
    });
    await armarYSeguir(s, 1_780_000);
    expect(s.detallada.armar).not.toHaveBeenCalled();
  });
});
