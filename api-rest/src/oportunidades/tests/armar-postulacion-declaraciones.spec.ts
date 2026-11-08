import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { GeneracionService } from '../generacion/generacion.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { ArmarLaOfertaService } from '../postulacion/armar-la-oferta.service';
import {
  ArmarPostulacionService,
  vaLaPropuesta,
} from '../postulacion/armar-postulacion.service';
import type { CotizacionDeLaPostulacionService } from '../postulacion/cotizacion-de-la-postulacion.service';
import {
  pidenElDetalle,
  pidenLaCotizacion,
} from '../postulacion/la-cotizacion-detallada';
import type { LaCotizacionDetalladaService } from '../postulacion/la-cotizacion-detallada.service';
import type { LaExperienciaService } from '../postulacion/la-experiencia.service';
import type { LasDeclaracionesService } from '../postulacion/las-declaraciones.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// «ARMAR POSTULACIÓN» ARMA TODO LO QUE PIDEN LAS BASES (decisión 119, parte
// 3b, 08-11). Felipe: "me arma todos los documentos que necesito subir
// según las bases y según la ley". Junto con lo de siempre, las
// declaraciones sin formato; la propuesta y la cotización salen con el
// nombre que les dan las bases; lo que no salió por un dato queda dicho.

const USUARIO = {
  id: 'cuenta-1',
  company_id: 1,
  role: 'administrador',
} as unknown as User;

const ESPECIFICACIONES =
  'Especificaciones y detalle del servicio (espacios, menú de desayuno, almuerzo y once, entradas, horario)';

const BASES = {
  requisitos: [],
  formularios: [
    {
      nombre: 'Formato N°1 - Identificación del oferente',
      archivo: '',
      aplica: true,
      se_entrega_en: 'administrativa',
    },
  ],
  documentos: [
    {
      nombre: ESPECIFICACIONES,
      parte: 'tecnica',
      cuando: 'con_la_oferta',
      carpeta: 'otro',
      obligatorio: true,
    },
    {
      nombre: 'Oferta económica por línea',
      parte: 'economica',
      cuando: 'con_la_oferta',
      carpeta: 'otro',
      obligatorio: true,
    },
    {
      nombre: 'Datos bancarios para el pago',
      parte: 'economica',
      cuando: 'con_la_oferta',
      carpeta: 'otro',
      obligatorio: false,
    },
  ],
};

function armar() {
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
    ultimo: jest.fn().mockResolvedValue({ estado: 'listo', resultado: BASES }),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut: '77.701.305-K',
    }),
  };
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({
      id: 323,
      quotation_id: null,
      proceso: { tipo: 'licitacion' },
    }),
    archivosDelSet: jest.fn().mockResolvedValue([
      {
        id: 80,
        nombre: 'Datos bancarios para el pago 4362-30-LE26.docx',
        ruta: 'x/80',
        bytes: 10,
        seccion: 'postulacion',
        origen: 'generado',
        viene_de: null,
        generacion_id: 100,
        creado_en: '2026-11-07T10:00:00.000Z',
      },
    ]),
    trabajosDeLaIA: jest.fn().mockResolvedValue([
      {
        id: 100,
        tipo: 'oferta',
        estado: 'listo',
        creado_en: '2026-11-07T09:00:00.000Z',
        parametros: {},
      },
    ]),
  };
  const adjuntos = { borrarBorradores: jest.fn().mockResolvedValue(0) };
  const experiencia = { paraArmar: jest.fn().mockResolvedValue(null) };
  const detallada = { armar: jest.fn().mockResolvedValue({ id: 500 }) };
  const declaraciones = {
    armar: jest.fn().mockResolvedValue({
      hechas: 1,
      noSalieron: [
        '«Datos bancarios para el pago»: completa los datos bancarios en Configuración de empresa y vuelve a armar.',
      ],
    }),
  };
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
    detallada as unknown as LaCotizacionDetalladaService,
    undefined,
    declaraciones as unknown as LasDeclaracionesService,
  );
  return {
    servicio,
    oferta,
    documentos,
    generaciones,
    detallada,
    declaraciones,
  };
}

const armarYSeguir = async (s: ReturnType<typeof armar>, total: number) => {
  await s.servicio.armar(USUARIO, 323, total);
  const [, , , encadenar] = s.oferta.pedir.mock.calls[0] as [
    number,
    string,
    number,
    { despues: (id: number) => Promise<void> },
  ];
  await encadenar.despues(105);
};

describe('Armar postulación arma todo lo que piden las bases (decisión 119, parte 3b)', () => {
  it('las declaraciones junto con lo demás, y la propuesta y la cotización con el nombre de las bases', async () => {
    const s = armar();
    await armarYSeguir(s, 1_780_000);
    expect(s.declaraciones.armar).toHaveBeenCalledWith(USUARIO, 323, 105, {
      experiencia: null,
      // El borrador de la vuelta anterior lo reemplaza la nueva.
      reemplaza: [80],
      yaHechas: [],
    });
    expect(s.documentos.crearPropuesta).toHaveBeenCalledWith(
      1,
      'cuenta-1',
      323,
      expect.objectContaining({ nombre: ESPECIFICACIONES }),
    );
    expect(s.detallada.armar).toHaveBeenCalledWith(
      USUARIO,
      323,
      105,
      1_780_000,
      expect.objectContaining({ nombre: 'Oferta económica por línea' }),
    );
    // Lo que no salió por un dato queda dicho, con lo demás.
    expect(s.generaciones.anotarParametros).toHaveBeenCalledWith(1, 105, {
      postulacion: expect.objectContaining({
        problemas: [
          '«Datos bancarios para el pago»: completa los datos bancarios en Configuración de empresa y vuelve a armar.',
        ],
      }),
    });
  });

  it('un formulario técnico sin su formato no lo llena nadie: va la propuesta', () => {
    const conFormato = {
      formularios: [
        {
          nombre: 'Formulario N°6 - Propuesta técnica',
          archivo: 'Anexos.docx',
          aplica: true,
          se_entrega_en: 'tecnica',
        },
      ],
    };
    expect(vaLaPropuesta(conFormato)).toBe(false);
    expect(
      vaLaPropuesta({
        formularios: [
          {
            nombre: 'Formulario N°6 - Propuesta técnica (formato libre)',
            archivo: '',
            aplica: true,
            se_entrega_en: 'tecnica',
          },
        ],
      }),
    ).toBe(true);
  });

  it('la cotización también cuando la llaman oferta económica; si trae su formulario con archivo, lo llena la IA', () => {
    expect(pidenLaCotizacion(BASES)).toBe(true);
    const formato3 = (archivo: string) => ({
      documentos: [],
      formularios: [
        {
          nombre: 'Formato N°3 - Oferta económica',
          archivo,
          aplica: true,
          se_entrega_en: 'economica',
        },
      ],
    });
    expect(pidenLaCotizacion(formato3(''))).toBe(true);
    expect(pidenLaCotizacion(formato3('Formatos.docx'))).toBe(false);
    // El precio por persona, por jornada o por línea es el detalle.
    expect(
      pidenElDetalle({
        documentos: [
          {
            nombre:
              'Oferta económica con valor del salón por jornada y de coffee break y almuerzo por persona',
          },
        ],
      }),
    ).toBe(true);
    expect(
      pidenElDetalle({ documentos: [{ nombre: 'Cotización formal' }] }),
    ).toBe(false);
  });
});
