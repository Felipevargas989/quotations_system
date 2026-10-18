import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../../../testing/mocks';
import type { NotaDeBitacora } from '../../../seguimiento/elegibles';
import {
  ErrorDeOutlook,
  type MensajeDelBuzon,
} from '../../../seguimiento/outlook';
import type {
  FilaDeLaCotizacion,
  SeguimientoConIA,
  SeguimientoRepository,
} from '../../../seguimiento/seguimiento.repository';
import { SeguimientoConIAService } from '../../../seguimiento/seguimiento.service';
import type { RespuestaDelSeguimiento } from '../../../seguimiento/tipos';

// El botón «✉ Generar seguimiento» de punta a punta, con Claude y Outlook
// simulados: ni llamadas de verdad ni gasto. Lo que se cuida (doc 18): que
// solo tome las que vencieron por correo, que deje un BORRADOR en el hilo
// (nunca envía), que salte lo que no corresponde y que anote la bitácora
// solo cuando el borrador quedó. Datos de prueba, no de clientes reales.

type Pedido = {
  model: string;
  system: Array<{ cache_control?: unknown }>;
  messages: Array<{ role: string; content: string }>;
};
type Parse = jest.Mock<Promise<unknown>, [Pedido]>;

const CONTACTO = 'contacto@valledelsolquillon.cl';

const cotizacion = (
  f: Partial<FilaDeLaCotizacion> = {},
): FilaDeLaCotizacion => ({
  id: 'q607',
  company_id: 1,
  quotation_number: 607,
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

const compromiso: NotaDeBitacora = {
  created_at: '2026-10-11T13:40:00+00:00',
  tipo: 'correo',
  note: 'Seguimiento por correo',
  author_name: 'Felipe',
  next_contact_date: '2026-10-15',
  next_contact_done_at: null,
};

const envioDeEventia: MensajeDelBuzon = {
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

const escrito: RespuestaDelSeguimiento = {
  accion: 'borrador',
  motivo: '',
  asunto: '',
  cuerpo_html: '<p>¿Cómo está?</p><p>Le escribimos por la cotización.</p>',
  angulo: 'pregunta si pudo revisar las fechas de octubre',
};

const respuestaDe = (r: RespuestaDelSeguimiento) => ({
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

const usuario = {
  id: 'u1',
  company_id: 1,
  role: 'administrador',
  email: 'felipe@valledelsolquillon.cl',
  full_name: 'Felipe',
  derechos: ['base', 'seguimiento_con_ia'],
} as unknown as User;

const outlookFalso = (mensajes: MensajeDelBuzon[] = [envioDeEventia]) => ({
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

const armar = (
  parse: Parse,
  opciones: {
    fila?: FilaDeLaCotizacion;
    notas?: NotaDeBitacora[][];
    outlook?: ReturnType<typeof outlookFalso>;
    enEspera?: SeguimientoConIA[];
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
  const servicio = new SeguimientoConIAService(
    repositorio as unknown as SeguimientoRepository,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  jest
    .spyOn(servicio as unknown as { cliente: () => unknown }, 'cliente')
    .mockReturnValue({ messages: { parse } });
  jest
    .spyOn(servicio as unknown as { outlook: () => unknown }, 'outlook')
    .mockReturnValue(outlook);
  return { servicio, repositorio, bitacora, outlook };
};

const nuevoParse = (): Parse => jest.fn<Promise<unknown>, [Pedido]>();

describe('SeguimientoConIAService', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  const outlookLlave = process.env.MS_CLIENT_SECRET;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = llave;
    process.env.MS_CLIENT_SECRET = outlookLlave;
  });

  it('deja el borrador en el hilo de contacto@, dirigido al cliente, y lo anota en la bitácora', async () => {
    const parse = nuevoParse().mockResolvedValue(respuestaDe(escrito));
    const { servicio, bitacora, outlook, repositorio } = armar(parse);

    const r = await servicio.generar('q607', usuario);

    expect(outlook.borradorDeSeguimiento).toHaveBeenCalledWith(
      CONTACTO,
      'm1',
      escrito.cuerpo_html,
      'cliente@ejemplo.cl',
      [],
    );
    expect(r).toMatchObject({
      quotation_number: 607,
      accion: 'borrador',
      buzon: CONTACTO,
      modo: 'seguimiento',
      enlace: 'https://outlook.office.com/borr1',
    });
    // Se guarda con su identificador inmutable, para ver cuándo sale.
    expect(outlook.idInmutable).toHaveBeenCalledWith(CONTACTO, 'borr1');
    expect(repositorio.registrarBorrador).toHaveBeenCalledWith({
      company_id: 1,
      quotation_id: 'q607',
      buzon: CONTACTO,
      modo: 'seguimiento',
      borrador_id: 'inm-borr1',
      hilo_id: 'h1',
      enlace: 'https://outlook.office.com/borr1',
      angulo: 'pregunta si pudo revisar las fechas de octubre',
      creado_por: 'u1',
    });
    // La bitácora: tipo correo y SIN próxima fecha (la pone el envío).
    expect(bitacora.create).toHaveBeenCalledWith(usuario, {
      quotation_id: 'q607',
      tipo: 'correo',
      note: `Borrador de seguimiento con IA listo en el hilo de ${CONTACTO}: pregunta si pudo revisar las fechas de octubre. Revísalo en Outlook y envíalo desde ahí.`,
    });
    // Un viaje a Claude, con las reglas en caché y el comentario interno
    // marcado como del equipo.
    expect(parse).toHaveBeenCalledTimes(1);
    const pedido = parse.mock.calls[0][0];
    expect(pedido.model).toBe('claude-opus-5-5');
    expect(pedido.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const mensaje = pedido.messages[0].content;
    expect(mensaje).toContain('← EL COMPROMISO VENCIDO');
    expect(mensaje).toContain('NUNCA lo copies ni lo cites');
    expect(mensaje).toContain('Le enviamos la cotización N° 607.');
  });

  it('sin hilo con el cliente: correo nuevo en contacto@, con el asunto de la IA', async () => {
    const parse = nuevoParse().mockResolvedValue(
      respuestaDe({
        ...escrito,
        asunto: 'Cotización Estadía: jueves 15-10-2099',
      }),
    );
    const outlook = outlookFalso([]);
    const { servicio } = armar(parse, { outlook });

    const r = await servicio.generar('q607', usuario);

    expect(outlook.borradorNuevo).toHaveBeenCalledWith(
      CONTACTO,
      escrito.cuerpo_html,
      'cliente@ejemplo.cl',
      'Cotización Estadía: jueves 15-10-2099',
    );
    expect(r.modo).toBe('nuevo');
  });

  it('si la IA decide saltarla, no hay borrador ni bitácora', async () => {
    const parse = nuevoParse().mockResolvedValue(
      respuestaDe({
        ...escrito,
        accion: 'saltar',
        motivo: 'toca llamar: la nota dice llamar la próxima semana',
        cuerpo_html: '',
      }),
    );
    const { servicio, bitacora, outlook } = armar(parse);

    const r = await servicio.generar('q607', usuario);

    expect(r).toMatchObject({
      accion: 'saltada',
      motivo: 'toca llamar: la nota dice llamar la próxima semana',
    });
    expect(outlook.borradorDeSeguimiento).not.toHaveBeenCalled();
    expect(bitacora.create).not.toHaveBeenCalled();
  });

  it('una que no venció por correo no entra: 409 sin llamar a nadie', async () => {
    const parse = nuevoParse();
    const { servicio, outlook } = armar(parse, {
      notas: [[{ ...compromiso, tipo: 'whatsapp' }]],
    });

    await expect(servicio.generar('q607', usuario)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(parse).not.toHaveBeenCalled();
    expect(outlook.buscar).not.toHaveBeenCalled();
  });

  it('un evento que ya pasó, un cliente sin correo o un hilo con borrador se saltan sin gastar en la IA', async () => {
    const parse = nuevoParse();
    const pasado = armar(parse, {
      fila: cotizacion({
        event_date: '2026-10-01T00:00:00+00:00',
        event_end_date: null,
      }),
    });
    expect(await pasado.servicio.generar('q607', usuario)).toMatchObject({
      accion: 'saltada',
      motivo: 'el evento ya pasó.',
    });

    const sinCorreo = armar(parse, {
      fila: cotizacion({
        clients: {
          name: 'Cliente de Prueba',
          email: 'noindica@gmail.com',
          client_type: 'Particular',
          client_contacts: [],
        },
      }),
    });
    expect(
      (await sinCorreo.servicio.generar('q607', usuario)).motivo,
    ).toContain('no tiene un correo útil');

    const conBorrador = armar(parse, {
      outlook: outlookFalso([
        envioDeEventia,
        {
          ...envioDeEventia,
          id: 'b1',
          borrador: true,
          fecha: '2026-10-16T10:00:00Z',
        },
      ]),
    });
    expect((await conBorrador.servicio.generar('q607', usuario)).motivo).toBe(
      `ya hay un borrador en el hilo de ${CONTACTO}.`,
    );

    expect(parse).not.toHaveBeenCalled();
  });

  it('si alguien anotó una gestión mientras la IA escribía, no deja el borrador', async () => {
    const parse = nuevoParse().mockResolvedValue(respuestaDe(escrito));
    const otra: NotaDeBitacora = {
      ...compromiso,
      created_at: '2026-10-17T15:00:00+00:00',
      note: 'Llamé: lo confirma el lunes',
      next_contact_date: '2026-10-19',
    };
    const { servicio, outlook, bitacora } = armar(parse, {
      notas: [[compromiso], [compromiso, otra]],
    });

    const r = await servicio.generar('q607', usuario);

    expect(r.accion).toBe('saltada');
    expect(outlook.borradorDeSeguimiento).not.toHaveBeenCalled();
    expect(bitacora.create).not.toHaveBeenCalled();
  });

  it('sin la llave de Outlook, 503 claro', async () => {
    delete process.env.MS_CLIENT_SECRET;
    const servicio = new SeguimientoConIAService(
      {} as SeguimientoRepository,
      {} as QuotationFollowupsService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    await expect(servicio.generar('q607', usuario)).rejects.toThrow(
      'Falta la llave de Outlook',
    );
  });

  it('si Outlook no acepta la llave, 503 que lo dice (sin mostrarla)', async () => {
    const parse = nuevoParse();
    const outlook = outlookFalso();
    outlook.buscar.mockRejectedValue(
      new ErrorDeOutlook('Microsoft no entregó el permiso (401)', 401),
    );
    const { servicio } = armar(parse, { outlook });

    const error = await servicio
      .generar('q607', usuario)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toContain('revisa MS_CLIENT_SECRET');
  });

  it('la lista: solo las vencidas por correo, las más vencidas primero', async () => {
    const parse = nuevoParse();
    const { servicio, repositorio } = armar(parse);
    repositorio.vivas.mockResolvedValue([
      {
        id: 'a',
        quotation_number: 607,
        quotation_status: 'enviada',
        event_type: 'Estadía',
        event_date: null,
        clients: { name: 'Uno' },
      },
      {
        id: 'b',
        quotation_number: 477,
        quotation_status: 'en_negociacion',
        event_type: 'Paseo',
        event_date: null,
        clients: { name: 'Dos' },
      },
      {
        id: 'c',
        quotation_number: 600,
        quotation_status: 'enviada',
        event_type: 'Paseo',
        event_date: null,
        clients: { name: 'Tres' },
      },
      {
        id: 'd',
        quotation_number: 601,
        quotation_status: 'enviada',
        event_type: 'Paseo',
        event_date: null,
        clients: { name: 'Cuatro' },
      },
    ]);
    repositorio.compromisosAbiertos.mockResolvedValue([
      { ...compromiso, quotation_id: 'a', next_contact_date: '2026-10-15' },
      {
        ...compromiso,
        quotation_id: 'b',
        next_contact_date: '2026-10-06',
        note: 'Seguimiento Paulina',
      },
      {
        ...compromiso,
        quotation_id: 'c',
        tipo: 'whatsapp',
        next_contact_date: '2026-10-10',
      },
      { ...compromiso, quotation_id: 'd', next_contact_date: '2099-01-01' },
    ]);

    const lista = await servicio.pendientes(usuario);

    expect(lista.map((p) => p.quotation_number)).toEqual([477, 607]);
    expect(lista[0]).toMatchObject({
      cliente: 'Dos',
      proximo: '2026-10-06',
      nota: 'Seguimiento Paulina',
      borrador: null,
    });
    expect(lista[0].dias_vencido).toBeGreaterThan(lista[1].dias_vencido);
  });

  it('la lista dice qué borrador espera en Outlook, para mostrar el aviso «Borrador en Outlook»', async () => {
    const { servicio, repositorio } = armar(nuevoParse(), {
      enEspera: [fila()],
    });
    repositorio.vivas.mockResolvedValue([
      {
        id: 'q607',
        quotation_number: 607,
        quotation_status: 'enviada',
        event_type: 'Estadía',
        event_date: null,
        clients: { name: 'Uno' },
      },
    ]);
    repositorio.compromisosAbiertos.mockResolvedValue([
      { ...compromiso, quotation_id: 'q607' },
    ]);
    const [p] = await servicio.pendientes(usuario);
    expect(p.borrador).toEqual({
      buzon: CONTACTO,
      enlace: 'https://outlook.office.com/borr1',
      creado: '2026-10-17T20:52:00Z',
    });
  });
});

const fila = (f: Partial<SeguimientoConIA> = {}): SeguimientoConIA => ({
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

const delHilo = (
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

describe('cuando el borrador sale (doc 18 §9): Eventia lo anota solo', () => {
  const outlookLlave = process.env.MS_CLIENT_SECRET;
  beforeEach(() => {
    process.env.MS_CLIENT_SECRET = 'llave_de_prueba';
  });
  afterAll(() => {
    process.env.MS_CLIENT_SECRET = outlookLlave;
  });

  it('salió: lo anota a nombre de Asistente con el próximo correo a 14 días, y la cotización sale de la lista', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo('hola@eventi-app.com', '2026-10-11T13:34:00Z', {
        adjuntos: true,
      }),
      delHilo(CONTACTO, '2026-10-17T20:58:00Z'),
    ]);
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    const r = await servicio.revisar(usuario);

    expect(r).toEqual({ revisados: 1, cambiaron: ['q607'] });
    expect(outlook.estadoDelBorrador).toHaveBeenCalledWith(
      CONTACTO,
      'inm-borr1',
    );
    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Seguimiento con IA enviado desde contacto@ el 17-10. Próximo contacto por correo el 31-10, en 14 días.',
      tipo: 'correo',
      next_contact_date: '2026-10-31',
    });
    expect(repositorio.cerrarBorrador).toHaveBeenCalledWith(1, 7, {
      estado: 'enviado',
      enviado_at: '2026-10-17T20:58:00Z',
    });
  });

  it('con dos seguimientos sin respuesta, lo que sigue es una llamada a la semana', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo('hola@eventi-app.com', '2026-10-01T13:34:00Z'),
      delHilo(CONTACTO, '2026-10-08T15:00:00Z'),
      delHilo(CONTACTO, '2026-10-17T20:58:00Z'),
    ]);
    const { servicio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    await servicio.revisar(usuario);

    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Seguimiento con IA enviado desde contacto@ el 17-10. Van 2 seguimientos por correo sin respuesta: toca llamar el 24-10.',
      tipo: 'llamada',
      next_contact_date: '2026-10-24',
    });
  });

  it('se borró sin enviarse: queda descartado, sin línea, y el botón vuelve', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'eliminado',
      hilo: 'h1',
    });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo(CONTACTO, '2026-10-14T20:04:00Z', { adjuntos: true }),
      delHilo(CONTACTO, '2026-10-17T20:52:00Z', { borrador: true }),
    ]);
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    const r = await servicio.revisar(usuario);

    expect(r.cambiaron).toEqual(['q607']);
    expect(repositorio.cerrarBorrador).toHaveBeenCalledWith(1, 7, {
      estado: 'descartado',
    });
    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
  });

  it('se borró, pero salió otro correo de la casa en el hilo: ese fue el seguimiento', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({ estado: 'no_esta' });
    outlook.mensajesDelHilo.mockResolvedValue([
      delHilo(CONTACTO, '2026-10-14T20:04:00Z', { adjuntos: true }),
      delHilo(CONTACTO, '2026-10-17T22:10:00Z'),
    ]);
    const { servicio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    await servicio.revisar(usuario);

    // Sin el identificador, el hilo sale de la fila.
    expect(outlook.mensajesDelHilo).toHaveBeenCalledWith(CONTACTO, 'h1');
    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Se envió un seguimiento en el hilo de contacto@ el 17-10 (el borrador de la IA no se usó). Próximo contacto por correo el 31-10, en 14 días.',
      tipo: 'correo',
      next_contact_date: '2026-10-31',
    });
  });

  it('si alguien ya anotó el próximo paso después del borrador, manda lo suyo', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    const aMano: NotaDeBitacora = {
      ...compromiso,
      created_at: '2026-10-17T21:05:00+00:00',
      note: 'Envié el seguimiento',
      next_contact_date: '2026-10-28',
    };
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
      notas: [[compromiso, aMano]],
    });

    await servicio.revisar(usuario);

    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
    expect(repositorio.cerrarBorrador).toHaveBeenCalledWith(1, 7, {
      estado: 'enviado',
      enviado_at: '2026-10-17T20:58:00Z',
    });
  });

  it('un negocio que ya no está vivo: se anota el envío, sin próximo contacto', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'enviado',
      hilo: 'h1',
      enviado: '2026-10-17T20:58:00Z',
    });
    const { servicio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
      fila: cotizacion({ quotation_status: 'aceptada' }),
    });

    await servicio.revisar(usuario);

    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q607',
      note: 'Seguimiento con IA enviado desde contacto@ el 17-10.',
      tipo: 'correo',
      next_contact_date: null,
    });
  });

  it('todavía de borrador: no anota nada', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'borrador',
      hilo: 'h1',
    });
    const { servicio, repositorio, bitacora } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });

    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 1,
      cambiaron: [],
    });
    expect(repositorio.cerrarBorrador).not.toHaveBeenCalled();
    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
  });

  it('el freno: lo que se miró hace menos de 5 minutos no se le pregunta a Outlook', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'borrador',
      hilo: 'h1',
    });
    const hace = (min: number) =>
      new Date(Date.now() - min * 60_000).toISOString();
    const haceDiez = hace(10);
    const { servicio, repositorio } = armar(nuevoParse(), {
      outlook,
      enEspera: [
        fila({ id: 7, revisado_at: hace(1) }),
        fila({ id: 8, quotation_id: 'q608', revisado_at: haceDiez }),
      ],
    });

    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 1,
      cambiaron: [],
    });
    // La 7 se miró hace un minuto: ni se toma ni se pregunta. La 8 se toma
    // solo si nadie la tomó desde que se leyó (misma hora de revisión).
    expect(repositorio.tomarParaRevisar.mock.calls).toEqual([[1, 8, haceDiez]]);
    expect(outlook.estadoDelBorrador).toHaveBeenCalledTimes(1);
  });

  it('si otra pantalla lo tomó primero, no se le pregunta a Outlook', async () => {
    const outlook = outlookFalso();
    const { servicio, repositorio } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila()],
    });
    repositorio.tomarParaRevisar.mockResolvedValue(false);

    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 0,
      cambiaron: [],
    });
    expect(repositorio.tomarParaRevisar).toHaveBeenCalledWith(1, 7, null);
    expect(outlook.estadoDelBorrador).not.toHaveBeenCalled();
  });

  it('sin la llave de Outlook no hace nada (y no falla)', async () => {
    delete process.env.MS_CLIENT_SECRET;
    const { servicio, repositorio } = armar(nuevoParse(), {
      enEspera: [fila()],
    });
    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 0,
      cambiaron: [],
    });
    expect(repositorio.borradoresEnEspera).not.toHaveBeenCalled();
  });

  it('si Outlook falla con un borrador, sigue con los demás y no rompe la pantalla', async () => {
    const outlook = outlookFalso();
    outlook.estadoDelBorrador
      .mockRejectedValueOnce(new ErrorDeOutlook('Outlook respondió 503', 503))
      .mockResolvedValueOnce({ estado: 'borrador', hilo: 'h2' });
    const { servicio } = armar(nuevoParse(), {
      outlook,
      enEspera: [fila(), fila({ id: 8, quotation_id: 'q608' })],
    });
    expect(await servicio.revisar(usuario)).toEqual({
      revisados: 2,
      cambiaron: [],
    });
  });

  it('con un borrador esperando, «Generar seguimiento» no escribe otro', async () => {
    const parse = nuevoParse();
    const outlook = outlookFalso();
    outlook.estadoDelBorrador.mockResolvedValue({
      estado: 'borrador',
      hilo: 'h1',
    });
    const { servicio } = armar(parse, { outlook, enEspera: [fila()] });

    const r = await servicio.generar('q607', usuario);

    expect(r).toMatchObject({
      accion: 'saltada',
      motivo:
        'ya hay un borrador esperando en Outlook (contacto@): ábrelo, revísalo y envíalo desde ahí.',
    });
    // Antes de decidir, una mirada fresca a Outlook (freno de 30 s).
    expect(outlook.estadoDelBorrador).toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(outlook.buscar).not.toHaveBeenCalled();
  });
});
