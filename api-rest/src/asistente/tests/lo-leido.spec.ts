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
import {
  LoLeido,
  MAX_FICHAS_AL_DIA,
  MINUTOS_AL_DIA,
} from '../conversacion/lo-leido';
import type { PropuestasService } from '../propuestas/propuestas.service';

// «QUE NO VUELVA A LEER LO MISMO» (Felipe, 04-11-2026): lo que BelIA leyó
// en la conversación viaja al día en las preguntas que siguen.

const felipe = (role = UserRole.ADMINISTRADOR): User =>
  ({
    id: 'perfil-felipe',
    company_id: 1,
    role,
    full_name: 'Felipe',
    derechos: ['base', 'calendario', 'asistente', 'post_venta'],
  }) as unknown as User;

describe('LoLeido', () => {
  it('guarda las últimas, sin repetir y la más nueva primero', () => {
    const m = new LoLeido();
    const u = felipe();
    [739, 255, 254, 739, 100].forEach((n, i) => m.anotar(u, n, 1_000 + i));
    expect(m.recientes(u, 2_000)).toEqual(
      [100, 739, 254].slice(0, MAX_FICHAS_AL_DIA),
    );
  });

  it('vencen a los minutos que dice, y se olvidan con la conversación', () => {
    const m = new LoLeido();
    const u = felipe();
    m.anotar(u, 739, 0);
    expect(m.recientes(u, MINUTOS_AL_DIA * 60_000)).toEqual([739]);
    expect(m.recientes(u, MINUTOS_AL_DIA * 60_000 + 1)).toEqual([]);
    m.anotar(u, 255, 0);
    m.olvidar(u);
    expect(m.recientes(u, 1)).toEqual([]);
  });

  it('cada persona tiene lo suyo', () => {
    const m = new LoLeido();
    m.anotar(felipe(), 739, 0);
    const camila = { ...felipe(), id: 'perfil-camila' } as User;
    expect(m.recientes(camila, 1)).toEqual([]);
  });
});

describe('Las fichas al día en la pregunta siguiente', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = llave;
  });

  const ficha = {
    id: 'q739',
    quotation_number: 739,
    quotation_status: QuotationStatus.ENVIADA,
    request_type: RequestType.COTIZACION,
    event_type: 'Paseo fin de año',
    event_date: '2026-12-26T00:00:00+00:00',
    event_end_date: null,
    people_count: 100,
    children_count: 0,
    total_amount: 4_430_000,
    subtotal_amount: 4_430_000,
    discount_amount: 0,
    discount_percentage: 0,
    tip_amount: 0,
    value_per_person: 44_300,
    sent_at: null,
    created_at: '2026-11-02T13:00:00+00:00',
    clients: { name: 'Hospital de Bulnes', client_type: 'Empresa' },
    mandante: null,
    contact_name: 'Nicol',
    items: { variable_services: [], fixed_services: [] },
    observations: null,
    comentario_interno: null,
    loss_reason: null,
  };

  const armar = (rol = UserRole.ADMINISTRADOR) => {
    const fin = (texto: string) => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: texto }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const create = jest
      .fn()
      // Primera pregunta: lee la ficha.
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'ver_cotizacion',
            input: { numero: 739 },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(fin('Está enviada.'))
      // Segunda pregunta: ya no la pide.
      .mockResolvedValueOnce(fin('Son 100 personas.'));
    const repositorio = {
      gastoDelMes: jest.fn().mockResolvedValue(0),
      registrarUso: jest.fn().mockResolvedValue(undefined),
      nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol'),
      nombreDeLaPersona: jest.fn().mockResolvedValue('Felipe'),
      cotizacionVista: jest.fn().mockResolvedValue(null),
      fichaDeCotizacion: jest.fn().mockResolvedValue(ficha),
    };
    const bitacora = {
      findByQuotation: jest.fn().mockResolvedValue([
        {
          created_at: '2026-11-04T14:00:00+00:00',
          author_name: 'Felipe',
          tipo: 'correo',
          note: 'Le mandé la cotización por $4.430.000.',
        },
      ]),
    };
    const servicio = new AsistenteService(
      repositorio as unknown as AsistenteRepository,
      {} as unknown as QuotationsRepository,
      {} as unknown as GenerarRepository,
      bitacora as unknown as QuotationFollowupsService,
      mockPinoLogger() as unknown as PinoLogger,
      {} as unknown as LogisticsService,
      {} as unknown as PropuestasService,
      {} as unknown as ChoquesDeFechaService,
      new LoLeido(),
    );
    jest
      .spyOn(servicio as unknown as { cliente: () => unknown }, 'cliente')
      .mockReturnValue({ messages: { create } });
    return { servicio, create, repositorio, usuario: felipe(rol) };
  };

  const textoDe = (pedido: unknown): string =>
    JSON.stringify((pedido as { messages: unknown[] }).messages.at(-1));

  it('la primera la lee; la segunda la recibe al día, sin pedirla', async () => {
    const { servicio, create, repositorio, usuario } = armar();
    await servicio.responder({ mensaje: '¿En qué va la 739?' }, usuario);
    expect(textoDe((create.mock.calls as unknown[][])[0][0])).not.toContain(
      'FICHAS AL DÍA',
    );
    await servicio.responder(
      {
        mensaje: '¿Y cuántas personas son?',
        historial: [
          { rol: 'persona', texto: '¿En qué va la 739?' },
          { rol: 'belia', texto: 'Está enviada.' },
        ],
      },
      usuario,
    );
    const segunda = textoDe((create.mock.calls as unknown[][])[2][0]);
    expect(segunda).toContain('FICHAS AL DÍA');
    expect(segunda).toContain('739');
    // La ficha se volvió a leer de la base, no se guardó la vieja.
    expect(repositorio.fichaDeCotizacion).toHaveBeenCalledTimes(2);
    // Y la pregunta sigue al final, tal cual.
    expect(segunda).toContain('¿Y cuántas personas son?');
  });

  it('a recepción, la de un tipo que su cargo no trabaja no le llega ni al día (doc 20 §18)', async () => {
    const { servicio, create, usuario } = armar(UserRole.RECEPCION);
    await servicio.responder({ mensaje: '¿En qué va la 739?' }, usuario);
    await servicio.responder({ mensaje: '¿Y la fecha?' }, usuario);
    const segunda = textoDe((create.mock.calls as unknown[][])[2][0]);
    expect(segunda).not.toContain('FICHAS AL DÍA');
    expect(segunda).not.toMatch(/\$\s?\d/);
  });
});
