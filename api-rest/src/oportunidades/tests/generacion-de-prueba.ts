import type Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import type { Catalogo } from 'src/quotations/generar/catalogo';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { EventiaRepository } from '../eventia/eventia.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import { GeneracionService, type Plan } from '../generacion/generacion.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import type { LoPostuladoService } from '../postulacion/lo-postulado.service';

// LO COMÚN DE LAS PRUEBAS DE GENERACIÓN (anexos, firma y propuesta): el
// servicio de prueba, los repositorios de mentira y los datos. Aparte para
// que las pruebas no pasen las 800 líneas del portero (18-10).

export const CUENTA = 'cuenta-1';
export const WORD =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const adjunto = (
  id: number,
  nombre: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/x_${nombre}`,
  tipo: nombre.endsWith('.pdf') ? 'application/pdf' : WORD,
  bytes: 1000,
  seccion: 'bases',
  origen: 'subido',
  viene_de: null,
  creado_en: `2026-10-17T13:0${id % 10}:00.000Z`,
  subido_por: 'perfil-1',
  quien: null,
  ...extra,
});

export const OFERENTE = {
  razon_social: 'VALLE DEL SOL QUILLON SPA',
  rut: '77.701.305-K',
  giro: 'Centro de eventos',
  representante_nombre: 'Felipe Vargas',
  representante_cargo: 'Gerente',
  coordinador_nombre: 'Camila Carvajal',
  experiencia: 'Día del Profesor 2025, Municipalidad de Quillón',
  instalaciones: 'Salón principal para 300 personas',
  firma_ruta: 'c1/oferente/firma_2026.png',
};

export const ANALISIS = {
  id: 5,
  estado: 'listo',
  resultado: {
    resumen: 'Ceremonia y cena para 160 funcionarios.',
    lugar: 'lo propone el oferente',
    criterios: [
      {
        nombre: 'Calidad de la oferta',
        peso: '30%',
        como_se_evalua: 'Anexo 4',
      },
    ],
    requisitos: [
      {
        que: 'Formulario Anexo N°1 firmado',
        tipo: 'administrativo',
        obligatorio: true,
        documento: 'Bases',
        pagina: 7,
      },
      {
        que: 'Mesas y sillas para 160 personas',
        tipo: 'tecnico',
        obligatorio: true,
        documento: 'Bases Técnicas',
        pagina: 18,
      },
    ],
    cumplimiento: {
      resumen: 'Tienes las mesas; el show hay que conseguirlo.',
      items: [
        {
          requisito: 1,
          que: 'Mesas y sillas para 160 personas',
          estado: 'tengo',
          con_que: 'Salón principal',
          por_que: '',
        },
        {
          requisito: 2,
          que: 'Show de baile de 40 minutos',
          estado: 'conseguir',
          con_que: '',
          por_que: 'No hay show en tu carta.',
        },
      ],
    },
  },
};

/** Un catálogo chico con ids (decisión 29): almuerzo con un menú, sus
 *  sueltos, la sección fija y la amplificación. */
export const CATALOGO_DE_PRUEBA: Catalogo = {
  categorias: [
    {
      id: 3,
      nombre: 'Almuerzo',
      orden: 1,
      sueltos: [10, 11, 12, 13],
      seccionFija: [10],
      secciones: [
        { nombre: 'Principales', servicios: [11, 13] },
        { nombre: 'Postres', servicios: [12] },
      ],
    },
  ],
  menus: [
    {
      id: 7,
      nombre: 'Almuerzo celebración',
      categoria: 'Almuerzo',
      nivel: 'Nivel 1',
      ordenNivel: 1,
      items: [
        { id: 11, nombre: 'Plateada', precio: 12_000, cantidad: 1 },
        { id: 12, nombre: 'Tiramisú', precio: 3_000, cantidad: 1 },
      ],
    },
  ],
  servicios: new Map([
    [10, { id: 10, nombre: 'Pan amasado', precio: 500 }],
    [11, { id: 11, nombre: 'Plateada', precio: 12_000 }],
    [12, { id: 12, nombre: 'Tiramisú', precio: 3_000 }],
    [13, { id: 13, nombre: 'Pollo arvejado', precio: 9_000 }],
  ]),
  fijos: new Map([[45, { id: 45, nombre: 'Amplificación', precio: 250_000 }]]),
  paquetes: [],
};

class GeneracionDePrueba extends GeneracionService {
  constructor(repos: Record<string, unknown>) {
    super(
      repos.repo as GeneracionRepository,
      repos.analisis as AnalisisRepository,
      repos.adjuntos as AdjuntosRepository,
      repos.oferente as OferenteRepository,
      repos.oportunidades as OportunidadesRepository,
      repos.eventia as EventiaRepository,
      repos.catalogos as GenerarRepository,
      repos.loPostulado as LoPostuladoService,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }

  protected cliente(): Anthropic {
    return {} as Anthropic;
  }
}

export function armar() {
  const repo = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn().mockResolvedValue(null),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 9, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn((ruta: string) =>
      Promise.resolve(Buffer.from(`archivo ${ruta}`)),
    ),
  };
  const analisis = { ultimo: jest.fn().mockResolvedValue(ANALISIS) };
  const adjuntos = {
    borrarBorradores: jest.fn().mockResolvedValue(0),
    paresFirmados: jest.fn().mockResolvedValue([]),
    dejarSoloElPdf: jest.fn().mockResolvedValue(0),
    listar: jest.fn((_: number, __: number, seccion: string) =>
      Promise.resolve(
        seccion === 'bases'
          ? [
              adjunto(4, 'D.A. N°4.770 Bases.pdf'),
              adjunto(6, 'Formularios_Anexos.docx'),
              adjunto(7, 'Anexo antiguo.doc'),
            ]
          : [
              adjunto(12, 'Formularios_Anexos - lleno.docx', {
                seccion: 'postulacion',
                origen: 'generado',
                viene_de: 6,
              }),
              adjunto(13, 'Patente.pdf', { seccion: 'postulacion' }),
              adjunto(14, 'Anexo 1 - firmado.docx', {
                seccion: 'postulacion',
                origen: 'firmado',
              }),
            ],
      ),
    ),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
    subirArchivo: jest.fn().mockResolvedValue(undefined),
    guardar: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 50, ...fila }),
    ),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue(OFERENTE),
    empresa: jest.fn().mockResolvedValue({
      name: 'Valle del Sol Quillón',
      logo_url:
        'https://lab.supabase.co/storage/v1/object/public/logos/c1/logo.png',
      bank_details: null,
    }),
    respaldos: jest.fn().mockResolvedValue([]),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 40,
      codigo: '1532886-5-LE26',
      proceso: {
        nombre: 'Ceremonia y Cena Día del Funcionario',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        fecha_cierre: '2026-10-19T19:00:00.000Z',
      },
    }),
    catalogoResumido: jest.fn().mockResolvedValue({
      paquetes: ['Matrimonio: cóctel, cena y fiesta'],
      fijos: ['Salón principal'],
    }),
  };
  const eventia = {
    carta: jest.fn().mockResolvedValue({
      fijos: [{ nombre: 'Salón principal', seccion: 'Salones' }],
      menus: [
        {
          categoria: 'Cena',
          nombre: 'Plateada',
          platos: ['Plateada al jugo', 'Papas rústicas'],
        },
      ],
      paquetes: ['Matrimonio: cóctel, cena y fiesta'],
    }),
    eventosRealizados: jest.fn().mockResolvedValue([
      {
        numero: 455,
        tipo: 'Celebraciones',
        fecha: '2025-12-12',
        personas: 150,
        monto: 9_800_000,
        cliente: 'Municipalidad de Bulnes',
        fijos: ['Salón principal'],
        // Un cliente público: se muestra solo (decisión 76).
        cliente_id: 'cliente-bulnes',
        tipo_de_cliente: 'Empresas Publicas',
      },
    ]),
  };
  const catalogos = {
    catalogo: jest.fn().mockResolvedValue(CATALOGO_DE_PRUEBA),
  };
  // Lo postulado (decisión 33): sin oferta armada, de partida.
  const loPostulado = {
    paraDocumentos: jest.fn().mockResolvedValue(null),
  };
  const servicio = new GeneracionDePrueba({
    repo,
    analisis,
    adjuntos,
    oferente,
    oportunidades,
    eventia,
    catalogos,
    loPostulado,
  });
  const ejecutar = jest
    .spyOn(servicio, 'ejecutar')
    .mockResolvedValue(undefined);
  return {
    repo,
    analisis,
    adjuntos,
    oferente,
    oportunidades,
    eventia,
    catalogos,
    loPostulado,
    servicio,
    ejecutar,
  };
}

export const planDe = (ejecutar: jest.SpyInstance) =>
  (ejecutar.mock.calls[0] as [number, number, Plan])[2];

export const entorno = async (prueba: () => Promise<void>) => {
  const antes = {
    llave: process.env.ANTHROPIC_API_KEY,
    supabase: process.env.SUPABASE_URL,
  };
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  process.env.SUPABASE_URL = 'https://lab.supabase.co';
  try {
    await prueba();
  } finally {
    if (antes.llave === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = antes.llave;
    if (antes.supabase === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = antes.supabase;
  }
};
