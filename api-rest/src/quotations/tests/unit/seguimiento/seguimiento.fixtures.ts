import type { PinoLogger } from 'nestjs-pino';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../../../testing/mocks';
import type { ChoquesDeFechaService } from '../../../choques/choques.service';
import type { NotaDeBitacora } from '../../../seguimiento/elegibles';
import type { MensajeDelBuzon } from '../../../seguimiento/outlook';
import type {
  FilaDeLaCotizacion,
  SeguimientoConIA,
  SeguimientoRepository,
} from '../../../seguimiento/seguimiento.repository';
import { SeguimientoConIAService } from '../../../seguimiento/seguimiento.service';
import type { RespuestaDelSeguimiento } from '../../../seguimiento/tipos';

// Los datos de prueba del seguimiento con IA, compartidos por
// `seguimiento.service.spec.ts` (el botón) y `seguimiento-envio.spec.ts`
// (cuando el borrador sale). Claude y Outlook simulados: ni llamadas de
// verdad ni gasto. Datos de prueba, no de clientes reales. Separados el
// 18-10-2026 porque el archivo único pasó las 800 líneas (portero del kit).

export type Pedido = {
  model: string;
  system: Array<{ cache_control?: unknown }>;
  messages: Array<{ role: string; content: string }>;
};
export type Parse = jest.Mock<Promise<unknown>, [Pedido]>;

export const CONTACTO = 'contacto@valledelsolquillon.cl';

export const cotizacion = (
  f: Partial<FilaDeLaCotizacion> = {},
): FilaDeLaCotizacion => ({
  id: 'q607',
  company_id: 1,
  quotation_number: 607,
  created_at: '2026-10-11T13:00:00+00:00',
  quotation_status: 'enviada',
  request_type: 'cotizacion',
  event_type: 'Estadía y Alimentación',
  // Lejos en el futuro: la prueba no caduca cuando pase la fecha.
  event_date: '2099-10-15T00:00:00+00:00',
  event_end_date: '2099-10-23T00:00:00+00:00',
  people_count: 120,
  children_count: 0,
  total_amount: 53_844_000,
  sent_at: '2026-10-11T13:34:00+00:00',
  observations: '[Desde formulario publico] --- Somos 120',
  comentario_interno: 'Cliente sensible al precio: no ofrecer nada nuevo',
  contact_name: 'Cliente de Prueba',
  client_contact_id: null,
  clients: {
    name: 'Cliente de Prueba',
    email: 'cliente@ejemplo.cl',
    client_type: 'Particular',
    client_contacts: [],
  },
  ...f,
});

export const compromiso: NotaDeBitacora = {
  created_at: '2026-10-11T13:40:00+00:00',
  tipo: 'correo',
  note: 'Seguimiento por correo',
  author_name: 'Felipe',
  next_contact_date: '2026-10-15',
  next_contact_done_at: null,
};

export const envioDeEventia: MensajeDelBuzon = {
  id: 'm1',
  hilo: 'h1',
  de: 'hola@eventi-app.com',
  para: ['cliente@ejemplo.cl'],
  cc: [],
  asunto: 'Cotización N° 607',
  fecha: '2026-10-11T13:34:00Z',
  borrador: false,
  adelanto: 'Le enviamos la cotización',
};

export const escrito: RespuestaDelSeguimiento = {
  accion: 'borrador',
  motivo: '',
  asunto: '',
  cuerpo_html: '<p>¿Cómo está?</p><p>Le escribimos por la cotización.</p>',
  angulo: 'pregunta si pudo revisar las fechas de octubre',
};

export const respuestaDe = (r: RespuestaDelSeguimiento) => ({
  parsed_output: r,
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(r) }],
  usage: {
    input_tokens: 3000,
    output_tokens: 400,
    cache_creation_input_tokens: 2500,
    cache_read_input_tokens: 0,
  },
});

export const usuario = {
  id: 'u1',
  company_id: 1,
  role: 'administrador',
  email: 'felipe@valledelsolquillon.cl',
  full_name: 'Felipe',
  derechos: ['base', 'seguimiento_con_ia'],
} as unknown as User;

export const outlookFalso = (
  mensajes: MensajeDelBuzon[] = [envioDeEventia],
) => ({
  buzones: [CONTACTO],
  esDeLaCasa: (c: string) =>
    c.startsWith('/o=') || /@(valledelsolquillon\.cl|eventi-app\.com)$/.test(c),
  esDeEventia: (c: string) => c.endsWith('@eventi-app.com'),
  idInmutable: jest.fn().mockResolvedValue({ id: 'inm-borr1', hilo: 'h1' }),
  estadoDelBorrador: jest.fn(),
  mensajesDelHilo: jest.fn().mockResolvedValue([]),
  buscar: jest.fn().mockResolvedValue(mensajes),
  leerTexto: jest.fn().mockResolvedValue('Le enviamos la cotización N° 607.'),
  borradorDeSeguimiento: jest.fn().mockResolvedValue({
    id: 'borr1',
    hilo: 'h1',
    enlace: 'https://outlook.office.com/borr1',
    para: ['cliente@ejemplo.cl'],
    cc: [],
    asunto: 'RE: Cotización N° 607',
  }),
  borradorRespuestaATodos: jest.fn(),
  borradorNuevo: jest.fn().mockResolvedValue({
    id: 'n1',
    enlace: null,
    para: ['cliente@ejemplo.cl'],
    cc: [],
    asunto: 'Cotización',
  }),
});

export const armar = (
  parse: Parse,
  opciones: {
    fila?: FilaDeLaCotizacion;
    notas?: NotaDeBitacora[][];
    outlook?: ReturnType<typeof outlookFalso>;
    enEspera?: SeguimientoConIA[];
    /** Las cotizaciones con tope de calendario. */
    conTope?: string[];
  } = {},
) => {
  const notas = opciones.notas ?? [[compromiso]];
  const repositorio = {
    cotizacion: jest.fn().mockResolvedValue(opciones.fila ?? cotizacion()),
    bitacora: jest.fn(),
    vivas: jest.fn(),
    compromisosAbiertos: jest.fn(),
    borradoresEnEspera: jest.fn().mockResolvedValue(opciones.enEspera ?? []),
    registrarBorrador: jest.fn().mockResolvedValue(undefined),
    tomarParaRevisar: jest.fn().mockResolvedValue(true),
    cerrarBorrador: jest.fn().mockResolvedValue(true),
  };
  notas.forEach((n) => repositorio.bitacora.mockResolvedValueOnce(n));
  repositorio.bitacora.mockResolvedValue(notas[notas.length - 1]);
  const bitacora = {
    create: jest.fn().mockResolvedValue({}),
    crearComoAsistente: jest.fn().mockResolvedValue({}),
  };
  const outlook = opciones.outlook ?? outlookFalso();
  const choques = {
    cotizacionesConTope: jest
      .fn()
      .mockResolvedValue(new Set(opciones.conTope ?? [])),
  };
  const servicio = new SeguimientoConIAService(
    repositorio as unknown as SeguimientoRepository,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
    choques as unknown as ChoquesDeFechaService,
  );
  jest
    .spyOn(servicio as unknown as { cliente: () => unknown }, 'cliente')
    .mockReturnValue({ messages: { parse } });
  jest
    .spyOn(servicio as unknown as { outlook: () => unknown }, 'outlook')
    .mockReturnValue(outlook);
  return { servicio, repositorio, bitacora, outlook };
};

export const nuevoParse = (): Parse => jest.fn<Promise<unknown>, [Pedido]>();

export const fila = (f: Partial<SeguimientoConIA> = {}): SeguimientoConIA => ({
  id: 7,
  company_id: 1,
  quotation_id: 'q607',
  buzon: CONTACTO,
  modo: 'seguimiento',
  borrador_id: 'inm-borr1',
  hilo_id: 'h1',
  enlace: 'https://outlook.office.com/borr1',
  angulo: 'pregunta si pudo revisar las fechas de octubre',
  estado: 'borrador',
  enviado_at: null,
  revisado_at: null,
  creado_por: 'u1',
  created_at: '2026-10-17T20:52:00Z',
  ...f,
});

export const delHilo = (
  de: string,
  fecha: string,
  extra: Partial<MensajeDelBuzon> = {},
): MensajeDelBuzon => ({
  ...envioDeEventia,
  id: `${de}-${fecha}`,
  de,
  fecha,
  ...extra,
});

/** Devuelve una variable de entorno a como estaba. Asignarle `undefined`
 *  la deja con el texto "undefined" (que cuenta como llave puesta): si no
 *  existía, se borra. */
export const restaurarEnv = (nombre: string, valor: string | undefined) => {
  if (valor === undefined) delete process.env[nombre];
  else process.env[nombre] = valor;
};
