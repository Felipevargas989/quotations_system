import type { PinoLogger } from 'nestjs-pino';
import type { ClientsService } from 'src/clients/clients.service';
import type { LogisticsService } from 'src/logistics/logistics.service';
import { hoyEnChile } from 'src/oportunidades/analisis/comun';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import type { Catalogo } from 'src/quotations/generar/catalogo';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { QuotationsService } from 'src/quotations/quotations.service';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import type { AsistenteRepository } from '../asistente.repository';
import { CotizacionNuevaService } from '../propuestas/cotizacion-nueva.service';
import type {
  EventoDeLaCotizacion,
  FotoGuardada,
} from '../propuestas/editar-foto';
import type { LeccionesDesdeElChat } from '../propuestas/lecciones-desde-el-chat';
import type {
  Propuesta,
  PropuestasRepository,
} from '../propuestas/propuestas.repository';
import { PropuestasService } from '../propuestas/propuestas.service';
import {
  huellaDe,
  parcheDe,
  type CotizacionParaCambiar,
} from '../propuestas/reglas';
import type { SeguimientoDesdeElChat } from '../propuestas/seguimiento-desde-el-chat';

// LOS DATOS DE PRUEBA DE LAS PROPUESTAS DE BELIA (doc 20, fase 2): el
// catálogo chico, la foto de la 500, la cotización y el servicio armado con
// sus dobles. Los usan propuestas.spec.ts y cotizacion-nueva.spec.ts.

// Un catálogo chico: la Cena con su sección fija (pan, id 1), dos postres y
// un menú guardado; un salón de precio fijo.
export const catalogo = (): Catalogo => ({
  categorias: [
    {
      id: 10,
      nombre: 'Desayuno',
      orden: 1,
      sueltos: [5],
      seccionFija: [],
      secciones: [],
    },
    {
      id: 20,
      nombre: 'Cena',
      orden: 3,
      sueltos: [1, 2, 3, 4],
      seccionFija: [1],
      secciones: [
        { nombre: 'Fija', servicios: [1] },
        { nombre: 'Principales', servicios: [2] },
        { nombre: 'Postres', servicios: [3, 4] },
      ],
    },
  ],
  menus: [
    {
      id: 900,
      nombre: 'Cena nivel 1',
      categoria: 'Cena',
      nivel: 'Nivel 1',
      ordenNivel: 1,
      items: [
        { id: 2, nombre: 'Lomo', precio: 9_000, cantidad: 1 },
        { id: 3, nombre: 'Leche nevada', precio: 2_000, cantidad: 1 },
      ],
    },
  ],
  servicios: new Map([
    [1, { id: 1, nombre: 'Pan', precio: 500 }],
    [2, { id: 2, nombre: 'Lomo', precio: 9_000 }],
    [3, { id: 3, nombre: 'Leche nevada', precio: 2_000 }],
    [4, { id: 4, nombre: 'Leche asada', precio: 2_500 }],
    [5, { id: 5, nombre: 'Café', precio: 1_000 }],
  ]),
  fijos: new Map([[70, { id: 70, nombre: 'Salón', precio: 300_000 }]]),
  paquetes: [],
});

// Tres días, 40 adultos: la cena del día 1 con leche nevada guardada a
// $1.800 (el precio de cuando se cotizó; hoy el catálogo dice $2.000).
export const foto = (): FotoGuardada => ({
  variable_services: [
    {
      category: 'Cena',
      category_id: 20,
      day: 1,
      audience: 'adultos',
      people: 40,
      items: [
        {
          codigo: '1',
          nombre: 'Pan',
          precio: 500,
          categoria: 'Cena',
          quantity: 1,
        },
        {
          codigo: '2',
          nombre: 'Lomo',
          precio: 9_000,
          categoria: 'Cena',
          quantity: 1,
        },
        {
          codigo: '3',
          nombre: 'Leche nevada',
          precio: 1_800,
          categoria: 'Cena',
          quantity: 1,
        },
      ],
    },
    {
      category: 'Desayuno',
      category_id: 10,
      day: 2,
      audience: 'adultos',
      people: 40,
      items: [
        {
          codigo: '5',
          nombre: 'Café',
          precio: 1_000,
          categoria: 'Desayuno',
          quantity: 1,
        },
      ],
    },
  ],
  fixed_services: [],
});

export const evento: EventoDeLaCotizacion = {
  fecha: '2026-11-09',
  ultimoDia: '2026-11-11',
  personas: 40,
  ninos: 0,
  esTourOperador: false,
};

export const cotizacion = (
  c: Partial<CotizacionParaCambiar> = {},
): CotizacionParaCambiar => ({
  id: 'q500',
  quotation_number: 500,
  quotation_status: QuotationStatus.ENVIADA,
  request_type: RequestType.COTIZACION,
  event_date: '2026-11-09T00:00:00+00:00',
  event_end_date: '2026-11-11T00:00:00+00:00',
  people_count: 40,
  children_count: 0,
  items: foto(),
  subtotal_amount: 0,
  discount_percentage: 0,
  discount_amount: 0,
  tip_percentage: null,
  tip_amount: 0,
  total_amount: 0,
  value_per_person: 0,
  fixed_value: 0,
  clients: { name: 'Rudel', client_type: 'empresa' },
  ...c,
});

export const persona = (role: UserRole, derechos = ['base', 'post_venta']) =>
  ({ role, derechos }) as unknown as User;

export const hoy = hoyEnChile();

export const armarServicio = (
  q: CotizacionParaCambiar,
  propuesta: Partial<Propuesta> = {},
) => {
  const p: Propuesta = {
    id: 'p1',
    company_id: 1,
    quotation_id: q.id,
    usuario_id: 'perfil-1',
    usuario_nombre: 'Camila',
    tipo: 'servicios',
    resumen: 'Leche asada en vez de leche nevada el día 1',
    antes: { items: q.items, total_amount: 0 },
    despues: {
      cambios: [],
      parche: parcheDe(q, foto()).parche,
      dias_tocados: [1],
      bajan_personas: false,
    },
    huella_antes: huellaDe(q),
    huella_despues: null,
    estado: 'pendiente',
    vence_at: new Date(Date.now() + 3_600_000).toISOString(),
    aplicada_at: null,
    deshecha_at: null,
    created_at: new Date().toISOString(),
    ...propuesta,
  };
  const repositorio = {
    propuesta: jest.fn().mockResolvedValue(p),
    moverPropuesta: jest.fn().mockResolvedValue(true),
    cotizacionParaCambiar: jest.fn().mockResolvedValue(q),
    comprasDelEvento: jest.fn().mockResolvedValue(0),
    descartarPendientes: jest.fn().mockResolvedValue(undefined),
    crearPropuesta: jest.fn().mockImplementation((fila: object) =>
      Promise.resolve({
        ...fila,
        id: 'p-nueva',
        vence_at: '2026-11-04T05:00:00Z',
      }),
    ),
    plataDe: jest
      .fn()
      .mockResolvedValue({ cuotas: [], abonos: [], reembolsos: [] }),
    tiposDeEvento: jest
      .fn()
      .mockResolvedValue(['Almuerzo o Cena', 'Estadía y Alimentación']),
    tiposDeCliente: jest.fn().mockResolvedValue(['Empresas', 'Particulares']),
    clienteDeLaEmpresa: jest.fn().mockResolvedValue({
      id: 'c1',
      name: 'Ecofor',
      client_type: 'Empresas',
    }),
    descartarNuevasPendientes: jest.fn().mockResolvedValue(undefined),
  };
  const cotizaciones = {
    update: jest.fn().mockResolvedValue({}),
    checkConflictsWithExistingQuotations: jest
      .fn()
      .mockResolvedValue({ has_conflicts: false }),
    create: jest.fn().mockResolvedValue({
      id: 'q-nueva',
      quotation_number: 612,
      quotation_status: QuotationStatus.SOLICITADA,
    }),
  };
  const clientes = {
    coincidencias: jest.fn().mockResolvedValue([]),
    crearDesdePantalla: jest.fn().mockResolvedValue({ id: 'c-nuevo' }),
  };
  const bitacora = {
    crearComoAsistente: jest.fn().mockResolvedValue({}),
    crearComoBelia: jest.fn().mockResolvedValue({}),
  };
  const generar = {
    catalogo: jest.fn().mockResolvedValue(catalogo()),
  } as unknown as GenerarRepository;
  // «Prepárame el seguimiento» (doc 20 §17): el borrador lo deja el
  // seguimiento con IA; acá basta saber que se llamó.
  // Las lecciones (doc 20 §17): basta saber a quién se le pidió.
  const leccionesDelChat = {
    anotar: jest
      .fn()
      .mockResolvedValue({ estado: 'aplicada', aviso: 'Anotada y aprobada.' }),
    decidir: jest
      .fn()
      .mockResolvedValue({ estado: 'aplicada', aviso: 'Aprobada.' }),
    porAprobar: jest.fn().mockResolvedValue([]),
  };
  const seguimientoDelChat = {
    proponer: jest.fn(),
    dejar: jest.fn().mockResolvedValue({
      estado: 'aplicada',
      numero: q.quotation_number,
      enlace: `/negocio/${q.id}`,
      aviso: 'El borrador quedó en el hilo del cliente.',
    }),
  };
  const nuevas = new CotizacionNuevaService(
    repositorio as unknown as PropuestasRepository,
    generar,
    cotizaciones as unknown as QuotationsService,
    clientes as unknown as ClientsService,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  // El mismo doble hace de los dos repositorios: el de BelIA (la plata) y
  // el de las propuestas.
  const servicio = new PropuestasService(
    repositorio as unknown as AsistenteRepository,
    repositorio as unknown as PropuestasRepository,
    generar,
    {
      findDayPrints: jest.fn().mockResolvedValue([]),
    } as unknown as LogisticsService,
    cotizaciones as unknown as QuotationsService,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
    nuevas,
    seguimientoDelChat as unknown as SeguimientoDesdeElChat,
    leccionesDelChat as unknown as LeccionesDesdeElChat,
  );
  return {
    servicio,
    repositorio,
    cotizaciones,
    bitacora,
    clientes,
    seguimientoDelChat,
    leccionesDelChat,
  };
};

export const camila = (role = UserRole.VENDEDOR): User =>
  ({
    id: 'perfil-1',
    company_id: 1,
    role,
    full_name: 'Camila',
    derechos: ['base', 'post_venta', 'asistente'],
  }) as unknown as User;
