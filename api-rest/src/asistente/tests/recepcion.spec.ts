import type { PinoLogger } from 'nestjs-pino';
import type { LogisticsService } from 'src/logistics/logistics.service';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { ChoquesDeFechaService } from 'src/quotations/choques/choques.service';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { QuotationsRepository } from 'src/quotations/quotations.repository';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import type { AsistenteRepository } from '../asistente.repository';
import { AsistenteService } from '../asistente.service';
import { herramientasPara } from '../herramientas';
import { filaComoLaVePersona } from '../herramientas/buscar-cotizaciones';
import { enlaceDe, type ContextoDeHerramienta } from '../herramientas/comun';
import { sinMontos } from '../herramientas/recepcion';
import { verCotizacion } from '../herramientas/ver-cotizacion';
import type { PropuestasService } from '../propuestas/propuestas.service';

// RECEPCIÓN CON BELIA (doc 20 §13; Felipe, 04-11-2026). La barrera que
// importa: nunca le llega un monto, ni de un campo ni escrito a mano en una
// nota, ni el enlace a la ficha que su pantalla no abre.

const recepcion = (): User =>
  ({
    id: 'perfil-isabel',
    company_id: 1,
    role: UserRole.RECEPCION,
    full_name: 'Isabel',
    derechos: ['base', 'calendario', 'asistente'],
  }) as unknown as User;

const PLATA = /\$\s?\d/;

const fila = {
  id: 'q743',
  quotation_number: 743,
  quotation_status: QuotationStatus.ENVIADA,
  request_type: RequestType.COTIZACION,
  event_type: 'Paseo de fin de año',
  event_date: '2026-12-14T00:00:00+00:00',
  event_end_date: null,
  people_count: 45,
  children_count: 0,
  total_amount: 2_835_000,
  sent_at: '2026-11-04T14:00:00+00:00',
  created_at: '2026-11-04T13:57:00+00:00',
  clients: { name: 'Marval' },
};

describe('sinMontos', () => {
  it('tapa lo que parece plata', () => {
    expect(sinMontos('Total $2.835.000 → $3.000.000')).toBe(
      'Total [monto] → [monto]',
    );
    expect(sinMontos('pidió rebaja a 25.000 pesos')).toBe(
      'pidió rebaja a [monto]',
    );
    expect(sinMontos('dijo que tiene 25 lucas por persona')).toBe(
      'dijo que tiene [monto] por persona',
    );
    expect(sinMontos('el tope es US$ 30')).toBe('el tope es [monto]');
  });

  it('deja lo que no es plata', () => {
    const t = 'N° 743, 45 adultos, lun 14-12, llamar al +56 9 2603 5311';
    expect(sinMontos(t)).toBe(t);
  });
});

describe('las herramientas de recepción', () => {
  it('ve el calendario, las cotizaciones, los clientes y lo de hoy; nada con plata', () => {
    const nombres = herramientasPara(recepcion()).map((h) => h.nombre);
    expect(nombres).toEqual(
      expect.arrayContaining([
        'buscar_cotizaciones',
        'ver_cotizacion',
        'calendario',
        'avisos_de_hoy',
        'buscar_clientes',
        // Solo como requerimiento, sin servicios.
        'proponer_cotizacion_nueva',
      ]),
    );
    for (const nunca of [
      'buscar_en_catalogo',
      'seguimientos_pendientes',
      'pagos_del_evento',
      'cobranza',
      'personal',
      'proponer_cambio_de_servicios',
      'proponer_nota',
    ]) {
      expect(nombres).not.toContain(nunca);
    }
  });

  it('la fila de una cotización le llega sin el total ni el enlace', () => {
    const r = filaComoLaVePersona(fila as never, UserRole.RECEPCION);
    expect(r).not.toHaveProperty('total');
    expect(r).not.toHaveProperty('enlace');
    expect(r).toMatchObject({ numero: 743, cliente: 'Marval', personas: 45 });
    // A quien vende, como siempre.
    const v = filaComoLaVePersona(fila as never, UserRole.VENDEDOR);
    expect(v).toMatchObject({ total: '$2.835.000', enlace: '/negocio/q743' });
  });

  it('la ficha: sin plata ni servicios, con la bitácora tapada', async () => {
    const ficha = {
      ...fila,
      clients: {
        name: 'Marval',
        client_type: 'Empresa',
        email: 'x@marval.cl',
        phone: '+56 9 1111 2222',
      },
      mandante: null,
      contact_name: 'Paula',
      subtotal_amount: 2_835_000,
      discount_amount: 0,
      discount_percentage: 0,
      tip_amount: 0,
      value_per_person: 63_000,
      items: {
        variable_services: [
          {
            category: 'Almuerzo',
            day: 1,
            items: [{ nombre: 'Asado', precio: 18_000, quantity: 1 }],
          },
        ],
      },
      observations: 'Valor por persona $63.000',
      comentario_interno: 'Quiere rebaja',
      loss_reason: null,
    };
    const ctx = {
      usuario: recepcion(),
      cotizacionAbierta: null,
      repositorio: { fichaDeCotizacion: jest.fn().mockResolvedValue(ficha) },
      bitacora: {
        findByQuotation: jest.fn().mockResolvedValue([
          {
            created_at: '2026-11-04T14:00:00+00:00',
            author_name: 'Felipe Vargas',
            tipo: 'correo',
            note: 'Se le envió la cotización por $2.835.000. Responde el lunes.',
          },
        ]),
      },
    } as unknown as ContextoDeHerramienta;

    const r = (await verCotizacion.ejecutar({ numero: 743 }, ctx)) as Record<
      string,
      unknown
    >;

    for (const fuera of [
      'plata',
      'dias',
      'fijos_de_todo_el_evento',
      'enlace',
      'observaciones_que_salen_en_el_pdf',
      'comentario_interno',
    ]) {
      expect(r).not.toHaveProperty(fuera);
    }
    expect(r).toMatchObject({ numero: 743, estado: expect.any(String) });
    expect(JSON.stringify(r)).not.toMatch(PLATA);
    expect(JSON.stringify(r)).toContain('Responde el lunes');
  });
});

describe('lo que le llega a la IA cuando escribe recepción', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = llave;
  });

  it('sin montos ni enlaces, y con las instrucciones de recepción', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'buscar_cotizaciones',
            input: { cliente: 'Marval', orden: 'total' },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Está enviada.' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    const repositorio = {
      gastoDelMes: jest.fn().mockResolvedValue(0),
      registrarUso: jest.fn().mockResolvedValue(undefined),
      nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol'),
      nombreDeLaPersona: jest.fn().mockResolvedValue('Isabel'),
      cotizacionVista: jest.fn().mockResolvedValue(null),
      buscarCotizaciones: jest
        .fn()
        .mockResolvedValue({ total: 1, filas: [fila] }),
    };
    const servicio = new AsistenteService(
      repositorio as unknown as AsistenteRepository,
      {} as unknown as QuotationsRepository,
      {} as unknown as GenerarRepository,
      {} as unknown as QuotationFollowupsService,
      mockPinoLogger() as unknown as PinoLogger,
      {} as unknown as LogisticsService,
      {} as unknown as PropuestasService,
      {} as unknown as ChoquesDeFechaService,
    );
    jest
      .spyOn(servicio as unknown as { cliente: () => unknown }, 'cliente')
      .mockReturnValue({ messages: { create } });

    await servicio.responder(
      { mensaje: '¿En qué va lo de Marval?' },
      recepcion(),
    );

    const [primera] = create.mock.calls[0] as [{ system: unknown }];
    expect(JSON.stringify(primera.system)).toContain(
      'Quien escribe es de recepción',
    );
    // No ordena por plata: «las más grandes primero» también dice cuánto valen.
    expect(repositorio.buscarCotizaciones).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ orden: 'fecha_evento' }),
    );
    const [segunda] = create.mock.calls[1] as [
      { messages: { content: unknown }[] },
    ];
    const resultado = JSON.stringify(
      segunda.messages[segunda.messages.length - 1].content,
    );
    expect(resultado).toContain('743');
    expect(resultado).not.toMatch(PLATA);
    expect(resultado).not.toContain('/negocio/');
  });

  it('el ánimo de recepción: solo los requerimientos de hoy, sin seguimientos', async () => {
    const repositorio = {
      buscarCotizaciones: jest.fn().mockResolvedValue({ total: 3, filas: [] }),
    };
    const cotizaciones = { findAll: jest.fn() };
    const choques = { listar: jest.fn() };
    const servicio = new AsistenteService(
      repositorio as unknown as AsistenteRepository,
      cotizaciones as unknown as QuotationsRepository,
      {} as unknown as GenerarRepository,
      {} as unknown as QuotationFollowupsService,
      mockPinoLogger() as unknown as PinoLogger,
      {} as unknown as LogisticsService,
      {} as unknown as PropuestasService,
      choques as unknown as ChoquesDeFechaService,
    );
    expect(await servicio.estado(recepcion())).toEqual({
      vencidos: 0,
      sin_gestion: 0,
      vencen_hoy: 0,
      requerimientos_de_hoy: 3,
      topes_de_calendario: 0,
      comprobantes_por_revisar: 0,
    });
    expect(cotizaciones.findAll).not.toHaveBeenCalled();
    expect(choques.listar).not.toHaveBeenCalled();
  });
});

describe('«Crear requerimiento» de recepción', () => {
  it('sin servicios ni precios: con `cambios`, no propone', async () => {
    const herramienta = herramientasPara(recepcion()).find(
      (h) => h.nombre === 'proponer_cotizacion_nueva',
    )!;
    const proponerCotizacionNueva = jest.fn();
    const ctx = {
      usuario: recepcion(),
      propuestas: { proponerCotizacionNueva },
      tarjetas: [],
      hoy: '2026-11-04',
    } as unknown as ContextoDeHerramienta;
    await expect(
      herramienta.ejecutar(
        {
          resumen: 'Paseo de Marval',
          tipo_de_evento: 'Paseo',
          fecha: '2026-12-14',
          personas: 45,
          cambios: [{ accion: 'poner_casilla' }],
        },
        ctx,
      ),
    ).rejects.toThrow('Recepción crea requerimientos');
    expect(proponerCotizacionNueva).not.toHaveBeenCalled();
  });

  it('el enlace de recepción lleva a Requerimientos, no a la ficha', () => {
    expect(
      enlaceDe(
        { id: 'q743', quotation_status: QuotationStatus.ENVIADA },
        UserRole.RECEPCION,
      ),
    ).toBe('/requests');
  });
});
