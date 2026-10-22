import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { mockPinoLogger } from '../../../../testing/mocks';
import type { ChoquesDeFechaService } from '../../../choques/choques.service';
import type { NotaDeBitacora } from '../../../seguimiento/elegibles';
import {
  ErrorDeOutlook,
  type MensajeDelBuzon,
} from '../../../seguimiento/outlook';
import type { SeguimientoRepository } from '../../../seguimiento/seguimiento.repository';
import { SeguimientoConIAService } from '../../../seguimiento/seguimiento.service';
import {
  armar,
  compromiso,
  CONTACTO,
  cotizacion,
  envioDeEventia,
  escrito,
  fila,
  nuevoParse,
  outlookFalso,
  respuestaDe,
  restaurarEnv,
  usuario,
} from './seguimiento.fixtures';

// El botón «✉ Generar seguimiento» de punta a punta, con Claude y Outlook
// simulados: ni llamadas de verdad ni gasto. Lo que se cuida (doc 18): que
// solo tome las que vencieron por correo, que deje un BORRADOR en el hilo
// (nunca envía), que salte lo que no corresponde y que anote la bitácora
// solo cuando el borrador quedó. Datos de prueba, no de clientes reales.
// Cuando el borrador sale (doc 18 §9) está en `seguimiento-envio.spec.ts`.

describe('SeguimientoConIAService', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  const outlookLlave = process.env.MS_CLIENT_SECRET;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
  });
  afterAll(() => {
    restaurarEnv('ANTHROPIC_API_KEY', llave);
    restaurarEnv('MS_CLIENT_SECRET', outlookLlave);
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

  it('sin el hilo de la cotización en contacto@, lo busca en los demás buzones (nunca otro hilo)', async () => {
    const parse = nuevoParse().mockResolvedValue(respuestaDe(escrito));
    const outlook = outlookFalso();
    const FELIPE = 'felipe@valledelsolquillon.cl';
    outlook.buzones = [CONTACTO, FELIPE];
    const factura: MensajeDelBuzon = {
      ...envioDeEventia,
      id: 'fac1',
      hilo: 'h-factura',
      de: CONTACTO,
      asunto: 'RE: Factura N°347 evento',
      fecha: '2026-10-16T10:00:00Z',
    };
    const deFelipe: MensajeDelBuzon = {
      ...envioDeEventia,
      id: 'fel1',
      hilo: 'h-felipe',
      de: FELIPE,
      asunto: 'RE: Cotización paseo',
      fecha: '2026-10-12T10:00:00Z',
    };
    outlook.buscar.mockImplementation((buzon: string) =>
      Promise.resolve(buzon === CONTACTO ? [factura] : [deFelipe]),
    );
    const { servicio } = armar(parse, { outlook });

    const r = await servicio.generar('q607', usuario);

    expect(outlook.buscar).toHaveBeenCalledWith(FELIPE, 'cliente@ejemplo.cl');
    expect(outlook.borradorDeSeguimiento).toHaveBeenCalledWith(
      FELIPE,
      'fel1',
      escrito.cuerpo_html,
      'cliente@ejemplo.cl',
      [],
    );
    expect(r).toMatchObject({ buzon: FELIPE, modo: 'seguimiento' });
  });

  it('con tope de calendario no se insiste: se salta sin gastar en la IA ni buscar el hilo', async () => {
    const parse = nuevoParse();
    const { servicio, outlook } = armar(parse, { conTope: ['q607'] });

    const r = await servicio.generar('q607', usuario);

    expect(r).toMatchObject({
      accion: 'saltada',
      motivo:
        'tiene tope de calendario con una aceptada: primero decide si sigue con su fecha («Sí, puede seguir»).',
    });
    expect(parse).not.toHaveBeenCalled();
    expect(outlook.buscar).not.toHaveBeenCalled();
  });

  it('sin la llave de Outlook, 503 claro', async () => {
    delete process.env.MS_CLIENT_SECRET;
    const servicio = new SeguimientoConIAService(
      {} as SeguimientoRepository,
      {} as QuotationFollowupsService,
      mockPinoLogger() as unknown as PinoLogger,
      {} as ChoquesDeFechaService,
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

    // Con tope de calendario, la lista no la ofrece (Felipe, 18-10).
    const conTope = armar(parse, { conTope: ['b'] });
    conTope.repositorio.vivas.mockImplementation(repositorio.vivas);
    conTope.repositorio.compromisosAbiertos.mockImplementation(
      repositorio.compromisosAbiertos,
    );
    expect(
      (await conTope.servicio.pendientes(usuario)).map(
        (p) => p.quotation_number,
      ),
    ).toEqual([607]);
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
