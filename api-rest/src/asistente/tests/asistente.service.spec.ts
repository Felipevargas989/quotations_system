import type { PinoLogger } from 'nestjs-pino';
import { derechosDe } from 'src/auth/derechos';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { QuotationsRepository } from 'src/quotations/quotations.repository';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import type { AsistenteRepository } from '../asistente.repository';
import {
  AsistenteService,
  comoMensajes,
  costoDe,
  usoDe as usoDeLaApi,
} from '../asistente.service';
import { herramientasPara } from '../herramientas';

// BELIA (doc 20). Lo que importa probar acá son las barreras: la empresa
// sale de la sesión aunque la IA pida otra, lo que no tiene herramienta no
// existe, el tope frena antes de gastar y la cuenta del mes se anota.

type Pedido = {
  model: string;
  tools?: Array<{ name: string }>;
  messages: Array<{ role: string; content: unknown }>;
};

const usoDe = (entrada: number, salida: number) => ({
  input_tokens: entrada,
  output_tokens: salida,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
});

const texto = (t: string) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: t }],
  usage: usoDe(1000, 100),
});

const pide = (name: string, input: unknown, id = 'tu_1') => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
  usage: usoDe(1000, 50),
});

const usuario = (role: UserRole = UserRole.VENDEDOR): User =>
  ({
    id: 'perfil-1',
    company_id: 1,
    role,
    full_name: 'Camila',
    email: 'camila@valledelsolquillon.cl',
    derechos: ['base', 'calendario', 'asistente'],
  }) as unknown as User;

const armar = (respuestas: unknown[], gastado = 0) => {
  const create = jest.fn<Promise<unknown>, [Pedido]>();
  for (const r of respuestas) create.mockResolvedValueOnce(r);
  const repositorio = {
    gastoDelMes: jest.fn().mockResolvedValue(gastado),
    registrarUso: jest.fn().mockResolvedValue(undefined),
    nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol'),
    cotizacionVista: jest.fn().mockResolvedValue(null),
    buscarCotizaciones: jest.fn().mockResolvedValue({
      total: 1,
      filas: [
        {
          id: 'q500',
          quotation_number: 500,
          quotation_status: QuotationStatus.ACEPTADA,
          request_type: RequestType.COTIZACION,
          event_type: 'Estadía',
          event_date: '2026-11-09T00:00:00+00:00',
          event_end_date: '2026-11-22T00:00:00+00:00',
          people_count: 66,
          children_count: 0,
          total_amount: 40_840_800,
          sent_at: null,
          created_at: '2026-10-01T15:00:00+00:00',
          clients: { name: 'Rudel' },
        },
      ],
    }),
  };
  const servicio = new AsistenteService(
    repositorio as unknown as AsistenteRepository,
    {} as unknown as QuotationsRepository,
    {} as unknown as GenerarRepository,
    {} as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  jest
    .spyOn(servicio as unknown as { cliente: () => unknown }, 'cliente')
    .mockReturnValue({ messages: { create } });
  return { servicio, create, repositorio };
};

describe('AsistenteService (BelIA)', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  const tope = process.env.TOPE_ASISTENTE_USD;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
    delete process.env.TOPE_ASISTENTE_USD;
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = llave;
    process.env.TOPE_ASISTENTE_USD = tope;
  });

  it('contesta y anota la cuenta del mes con la empresa de la sesión', async () => {
    const { servicio, repositorio } = armar([texto('Hola, Camila.')]);
    const r = await servicio.responder({ mensaje: 'hola' }, usuario());
    expect(r.respuesta).toBe('Hola, Camila.');
    expect(r.costo_usd).toBeGreaterThan(0);
    const [fila] = repositorio.registrarUso.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(fila).toMatchObject({
      company_id: 1,
      usuario_id: 'perfil-1',
      modelo: 'claude-opus-5-5',
      tokens_entrada: 1000,
      tokens_salida: 100,
    });
    expect(fila.mes).toMatch(/^\d{4}-\d{2}$/);
    // Un vendedor no ve lo gastado: eso es de administración (doc 20 §7).
    expect(r.uso_del_mes).toBeUndefined();
  });

  it('corre la herramienta con la empresa de la SESIÓN aunque la IA pida otra', async () => {
    const { servicio, create, repositorio } = armar([
      pide('buscar_cotizaciones', { cliente: 'Rudel', company_id: 99 }),
      texto('La [N° 500](/negocio/q500) es de Rudel.'),
    ]);
    const r = await servicio.responder(
      { mensaje: '¿qué tiene Rudel?' },
      usuario(),
    );
    expect(repositorio.buscarCotizaciones).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ cliente: 'Rudel' }),
    );
    expect(r.herramientas).toEqual(['buscar_cotizaciones']);
    // La segunda vuelta lleva el resultado, con la cifra ya escrita.
    const segunda = create.mock.calls[1][0];
    const ultimo = segunda.messages[segunda.messages.length - 1];
    expect(ultimo.role).toBe('user');
    expect(JSON.stringify(ultimo.content)).toContain('$40.840.800');
    // Un vendedor no abre Post-Venta: el enlace es la ficha del negocio.
    expect(JSON.stringify(ultimo.content)).toContain('/negocio/q500');
  });

  it('lo que no tiene herramienta no existe: vuelve como error y no rompe', async () => {
    const { servicio, create } = armar([
      pide('anular_cotizacion', { numero: 500 }),
      texto('Eso no lo hago: se anula en Post-Venta.'),
    ]);
    const r = await servicio.responder({ mensaje: 'anula la 500' }, usuario());
    expect(r.respuesta).toContain('no lo hago');
    const segunda = create.mock.calls[1][0];
    const resultado = JSON.stringify(
      segunda.messages[segunda.messages.length - 1].content,
    );
    expect(resultado).toContain('"is_error":true');
    // Y a la IA nunca se le ofreció nada que escriba.
    const ofrecidas = (create.mock.calls[0][0].tools ?? []).map((t) => t.name);
    expect(ofrecidas).toEqual([
      'buscar_cotizaciones',
      'ver_cotizacion',
      'calendario',
      'seguimientos_pendientes',
      'buscar_en_catalogo',
      'buscar_clientes',
    ]);
  });

  it('con el tope del mes alcanzado no llama a Claude', async () => {
    const { servicio, create } = armar([texto('no debería')], 100);
    await expect(
      servicio.responder({ mensaje: 'hola' }, usuario()),
    ).rejects.toMatchObject({ status: 429 });
    expect(create).not.toHaveBeenCalled();
  });

  it('el tope se cambia en Railway con TOPE_ASISTENTE_USD', async () => {
    process.env.TOPE_ASISTENTE_USD = '150';
    const { servicio } = armar([texto('sí')], 120);
    const r = await servicio.responder(
      { mensaje: 'hola' },
      usuario(UserRole.ADMINISTRADOR),
    );
    // Solo administración ve lo gastado del mes.
    expect(r.uso_del_mes?.tope_usd).toBe(150);
    expect(r.uso_del_mes?.gastado_usd).toBeGreaterThanOrEqual(120);
  });

  it('si Claude falla, igual anota lo gastado y responde en palabras de la casa', async () => {
    const { servicio, create, repositorio } = armar([
      pide('buscar_cotizaciones', { cliente: 'Rudel' }),
    ]);
    create.mockRejectedValueOnce(new Error('se cayó'));
    await expect(
      servicio.responder({ mensaje: '¿y Rudel?' }, usuario()),
    ).rejects.toMatchObject({ status: 503 });
    const [fila] = repositorio.registrarUso.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(fila.fallo).toBe('se cayó');
    expect(fila.tokens_entrada).toBe(1000);
  });
});

describe('las herramientas de cada cargo', () => {
  it('recepción no recibe ninguna; quien vende recibe las seis', () => {
    const con = (role: UserRole) =>
      herramientasPara({
        role,
        derechos: ['base', 'calendario', 'asistente'],
      } as unknown as User).map((h) => h.nombre);
    expect(con(UserRole.RECEPCION)).toEqual([]);
    expect(con(UserRole.VENDEDOR)).toHaveLength(6);
    expect(con(UserRole.ADMINISTRADOR)).toHaveLength(6);
  });

  it('el calendario pide el derecho del plan', () => {
    const nombres = herramientasPara({
      role: UserRole.ADMINISTRADOR,
      derechos: ['base', 'asistente'],
    } as unknown as User).map((h) => h.nombre);
    expect(nombres).not.toContain('calendario');
  });

  it('el derecho «asistente» lo da la columna de módulos propios', () => {
    expect(
      derechosDe({
        plan: 'crece',
        estado_plan: 'gratis',
        modulos_propios: ['asistente'],
      }).derechos,
    ).toContain('asistente');
    expect(
      derechosDe({ plan: 'crece', estado_plan: 'activo' }).derechos,
    ).not.toContain('asistente');
  });
});

describe('la conversación que viaja', () => {
  it('parte con la persona, alterna y deja fuera el saludo de la ventanilla', () => {
    const m = comoMensajes(
      [
        { rol: 'belia', texto: 'Hola, ¿en qué te ayudo?' },
        { rol: 'persona', texto: '¿qué tiene Rudel?' },
        { rol: 'belia', texto: 'La 500.' },
        { rol: 'persona', texto: 'y' },
      ],
      '¿cuándo es?',
    );
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user']);
    expect(m[2].content).toBe('y\n\n¿cuándo es?');
  });
});

describe('el ánimo de BelIA (GET /asistente/estado)', () => {
  it('cuenta lo vencido y lo de hoy con la regla del tablero, sin llamar a Claude', async () => {
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
    }).format(new Date());
    const hace = (dias: number) =>
      new Date(Date.now() - dias * 86_400_000).toISOString();
    const vivas = [
      { id: 'a', created_at: hace(30), sent_at: hace(20) },
      { id: 'b', created_at: hace(30), sent_at: hace(20) },
      { id: 'c', created_at: hace(30), sent_at: hace(10) },
      { id: 'd', created_at: hace(1), sent_at: null },
    ];
    const bitacora = {
      // vencido hace 5 días
      a: { last_at: hace(6), next_contact_date: '2000-01-01' },
      // vence hoy: al día, pero cuenta para llamar la atención
      b: { last_at: hace(2), next_contact_date: hoy },
      // c: sin compromiso y 10 días sin gestión
    };
    const repositorio = {
      buscarCotizaciones: jest.fn().mockResolvedValue({ total: 2, filas: [] }),
    };
    const cotizaciones = { findAll: jest.fn().mockResolvedValue(vivas) };
    const seguimientos = {
      mapByCompany: jest.fn().mockResolvedValue(bitacora),
    };
    const servicio = new AsistenteService(
      repositorio as unknown as AsistenteRepository,
      cotizaciones as unknown as QuotationsRepository,
      {} as unknown as GenerarRepository,
      seguimientos as unknown as QuotationFollowupsService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    const crear = jest.fn();
    jest
      .spyOn(servicio as unknown as { cliente: () => unknown }, 'cliente')
      .mockReturnValue({ messages: { create: crear } });

    const e = await servicio.estado(usuario());

    expect(e).toEqual({
      vencidos: 1,
      sin_gestion: 1,
      vencen_hoy: 1,
      requerimientos_de_hoy: 2,
    });
    expect(cotizaciones.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 1 }),
    );
    expect(repositorio.buscarCotizaciones).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ tipo: RequestType.REQUERIMIENTO, limite: 1 }),
    );
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('lo que cuesta (doc 20 §7)', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = llave;
  });

  it('guarda las instrucciones una hora, marca solo el final de la conversación y piensa «medium»', async () => {
    const { servicio, create } = armar([
      pide('buscar_cotizaciones', { cliente: 'Rudel' }),
      texto('La 500.'),
    ]);
    await servicio.responder({ mensaje: '¿y Rudel?' }, usuario());
    const pedido = create.mock.calls[1][0] as unknown as {
      system: Array<{ cache_control?: { ttl?: string } }>;
      tools: Array<{ cache_control?: { ttl?: string } }>;
      output_config: { effort: string };
      messages: Array<{ content: unknown }>;
    };
    expect(pedido.system[0].cache_control).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    });
    expect(pedido.tools[pedido.tools.length - 1].cache_control).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    });
    expect(pedido.output_config).toEqual({ effort: 'medium' });
    // Una sola marca en la conversación: en el último bloque.
    const marcas = JSON.stringify(pedido.messages).match(/cache_control/g);
    expect(marcas).toHaveLength(1);
    const ultimo = pedido.messages[pedido.messages.length - 1]
      .content as Array<{
      cache_control?: unknown;
    }>;
    expect(ultimo[ultimo.length - 1].cache_control).toEqual({
      type: 'ephemeral',
    });
  });

  it('la caché de una hora se cobra a su precio', () => {
    const u = usoDeLaApi({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 2_000_000,
      cache_creation: {
        ephemeral_1h_input_tokens: 1_000_000,
        ephemeral_5m_input_tokens: 1_000_000,
      },
    } as unknown as Parameters<typeof usoDeLaApi>[0]);
    // Opus 5.5: US$ 8 el millón a una hora y US$ 5 a cinco minutos.
    expect(costoDe(u, 'claude-opus-5-5')).toBe(13);
  });
});
