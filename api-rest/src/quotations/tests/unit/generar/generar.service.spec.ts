import Anthropic from '@anthropic-ai/sdk';
import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../../../testing/mocks';
import type {
  FilaDelRequerimiento,
  GenerarRepository,
} from '../../../generar/generar.repository';
import { GenerarCotizacionService } from '../../../generar/generar.service';
import type { PlanDeLaIA } from '../../../generar/tipos';
import type { QuotationsService } from '../../../quotations.service';
import { catalogoDePrueba } from './catalogo-de-prueba';

// El botón «✨ Crear con IA» de punta a punta, con Claude simulado: no hay
// llamadas de verdad ni gasto. Lo que se cuida: que solo arme
// requerimientos vacíos, que la cuenta sea la del cotizador, que la nota
// vaya al comentario interno y que nunca envíe.

// Lo que el servicio le pide a Claude y lo que guarda, con tipo: así las
// pruebas leen los llamados sin `any`.
type Pedido = {
  model: string;
  system: Array<{ cache_control?: unknown }>;
  messages: Array<{ role: string; content: unknown }>;
};
type Parse = jest.Mock<Promise<unknown>, [Pedido]>;
const nuevoParse = (): Parse => jest.fn<Promise<unknown>, [Pedido]>();
type Cambios = Record<string, unknown>;

const requerimiento = (
  r: Partial<FilaDelRequerimiento> = {},
): FilaDelRequerimiento => ({
  id: 'q476',
  company_id: 1,
  quotation_number: 476,
  quotation_status: 'solicitada',
  request_type: 'requerimiento',
  event_type: 'Estadía y Alimentación',
  event_date: '2026-12-20T00:00:00+00:00',
  event_end_date: null,
  people_count: 41,
  children_count: 0,
  observations: 'Somos 41 de la faena, $1.000.000 en total',
  comentario_interno: 'Faena: cena, alojamiento y desayuno',
  total_amount: 0,
  items: { variable_services: [], fixed_services: [] },
  client_id: 'c1',
  clients: { name: 'Ecofor', client_type: 'Empresas' },
  ...r,
});

const planDeFaena: PlanDeLaIA = {
  cajas: [
    {
      dia: 1,
      categoria: 'Cena',
      audiencia: 'adultos',
      personas: 41,
      menu_id: 94,
      servicios: [],
    },
    {
      dia: 1,
      categoria: 'Servicios de Ingreso',
      audiencia: 'adultos',
      personas: 41,
      menu_id: 0,
      servicios: [{ id: 2155, cantidad: 1 }],
    },
    {
      dia: 2,
      categoria: 'Desayuno',
      audiencia: 'adultos',
      personas: 41,
      menu_id: 47,
      servicios: [],
    },
  ],
  fijos: [],
  ultimo_dia: '2026-12-21',
  descuento_porcentaje: 0,
  presupuesto_cliente: { monto: 1_000_000, por: 'total' },
  nota: '• Faena: cena Nivel 1, alojamiento de alta y desayuno Estándar.',
};

const respuestaDe = (plan: PlanDeLaIA | null, stop = 'end_turn') => ({
  parsed_output: plan,
  stop_reason: stop,
  content: [{ type: 'text', text: JSON.stringify(plan) }],
  usage: {
    input_tokens: 4000,
    output_tokens: 3000,
    cache_creation_input_tokens: 15000,
    cache_read_input_tokens: 0,
  },
});

const usuario = {
  id: 'u1',
  company_id: 1,
  role: 'administrador',
  email: 'felipe@valledelsolquillon.cl',
  full_name: 'Felipe',
  derechos: ['base', 'cotizar_con_ia'],
  plan: 'crece',
} as unknown as User;

const armar = (parse: Parse, fila = requerimiento()) => {
  const repositorio = {
    requerimiento: jest.fn().mockResolvedValue(fila),
    catalogo: jest.fn().mockResolvedValue(catalogoDePrueba()),
    vendidas: jest.fn().mockResolvedValue([]),
  };
  const quotations = {
    update: jest
      .fn<Promise<unknown>, [string, Cambios, number, string, unknown]>()
      .mockResolvedValue({}),
  };
  const bitacora = { create: jest.fn().mockResolvedValue({}) };
  const servicio = new GenerarCotizacionService(
    repositorio as unknown as GenerarRepository,
    quotations as unknown as QuotationsService,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  jest
    .spyOn(servicio as unknown as { cliente: () => unknown }, 'cliente')
    .mockReturnValue({ messages: { parse } });
  return { servicio, repositorio, quotations, bitacora };
};

describe('GenerarCotizacionService', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave_de_prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = llave;
  });

  it('arma la faena, la guarda en solicitada como cotización y anota en la bitácora', async () => {
    const parse = nuevoParse().mockResolvedValue(respuestaDe(planDeFaena));
    const { servicio, quotations, bitacora } = armar(parse);

    const r = await servicio.generar('q476', usuario);

    expect(r.total_amount).toBe(41 * 47_600);
    expect(r.value_per_person).toBe(47_600);
    const [id, cambios, empresa, rol] = quotations.update.mock.calls[0];
    expect([id, empresa, rol]).toEqual(['q476', 1, 'administrador']);
    expect(cambios).toMatchObject({
      request_type: 'cotizacion',
      value_per_person: 47_600,
      total_amount: 1_951_600,
      discount_percentage: 0,
      tip_percentage: null,
      event_end_date: '2026-12-21',
    });
    // Nunca cambia el estado ni envía: no viaja quotation_status.
    expect(cambios).not.toHaveProperty('quotation_status');
    // La nota va al FINAL del comentario interno, con el presupuesto.
    expect(cambios.comentario_interno).toMatch(
      /^Faena: cena, alojamiento y desayuno\n\n— Generada con IA · /,
    );
    expect(cambios.comentario_interno).toContain('Faena: cena Nivel 1');
    expect(cambios.comentario_interno).toContain(
      'Se excede el presupuesto: el cliente habla de $1.000.000 en total y la cotización suma $1.951.600 en total.',
    );
    expect(cambios).not.toHaveProperty('observations');
    expect(bitacora.create).toHaveBeenCalledWith(
      usuario,
      expect.objectContaining({ quotation_id: 'q476', tipo: 'otro' }),
    );
    // Un solo viaje a Claude, con el catálogo en caché.
    expect(parse).toHaveBeenCalledTimes(1);
    const pedido = parse.mock.calls[0][0];
    expect(pedido.model).toBe('claude-opus-5-5');
    expect(pedido.system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(pedido.messages[0].content).toContain('COMENTARIO INTERNO');
  });

  it('si lo primero no calza con el catálogo, la IA corrige una vez', async () => {
    const malo: PlanDeLaIA = {
      ...planDeFaena,
      cajas: [{ ...planDeFaena.cajas[0], menu_id: 47 }],
    };
    const parse = nuevoParse()
      .mockResolvedValueOnce(respuestaDe(malo))
      .mockResolvedValueOnce(respuestaDe(planDeFaena));
    const { servicio, quotations } = armar(parse);

    await servicio.generar('q476', usuario);

    expect(parse).toHaveBeenCalledTimes(2);
    const segunda = parse.mock.calls[1][0].messages;
    expect(segunda).toHaveLength(3);
    expect(segunda[2].content).toContain('es de «Desayuno»');
    expect(quotations.update).toHaveBeenCalledTimes(1);
  });

  it('si una comida no tiene la forma de la casa, la IA la revisa una vez y lo que quede va a la nota', async () => {
    const sinPostre: PlanDeLaIA = {
      ...planDeFaena,
      cajas: [
        {
          ...planDeFaena.cajas[0],
          menu_id: 0,
          servicios: [
            { id: 3001, cantidad: 1 },
            { id: 3004, cantidad: 1 },
          ],
        },
        ...planDeFaena.cajas.slice(1),
      ],
    };
    const parse = nuevoParse().mockResolvedValue(respuestaDe(sinPostre));
    const { servicio, quotations } = armar(parse);

    await servicio.generar('q476', usuario);

    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1][0].messages[2].content).toContain(
      'Revisa estas cajas con las reglas de la casa',
    );
    const cambios = quotations.update.mock.calls[0][1];
    expect(cambios.comentario_interno).toContain(
      'Revisar: caja 1 (día 1, Cena): trae 2 principales',
    );
  });

  it('si tampoco calza la segunda vez, no guarda nada', async () => {
    const malo: PlanDeLaIA = { ...planDeFaena, cajas: [] };
    const parse = nuevoParse().mockResolvedValue(respuestaDe(malo));
    const { servicio, quotations } = armar(parse);

    await expect(servicio.generar('q476', usuario)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(quotations.update).not.toHaveBeenCalled();
  });

  it('nunca pisa lo armado: con servicios o ya convertida, se niega sin preguntar a la IA', async () => {
    const parse = nuevoParse();
    const conItems = armar(
      parse,
      requerimiento({
        items: { variable_services: [{}], fixed_services: [] },
      }),
    );
    await expect(
      conItems.servicio.generar('q476', usuario),
    ).rejects.toBeInstanceOf(ConflictException);
    const yaCotizacion = armar(
      parse,
      requerimiento({ request_type: 'cotizacion' }),
    );
    await expect(
      yaCotizacion.servicio.generar('q476', usuario),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(parse).not.toHaveBeenCalled();
  });

  it('si alguien la armó a mano mientras la IA pensaba, no la pisa', async () => {
    const parse = nuevoParse().mockResolvedValue(respuestaDe(planDeFaena));
    const { servicio, repositorio, quotations } = armar(parse);
    repositorio.requerimiento
      .mockResolvedValueOnce(requerimiento())
      .mockResolvedValueOnce(
        requerimiento({
          items: { variable_services: [{}], fixed_services: [] },
        }),
      );

    await expect(servicio.generar('q476', usuario)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(quotations.update).not.toHaveBeenCalled();
  });

  it('sin la llave de Anthropic, avisa claro y no hace nada', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const parse = nuevoParse();
    const { servicio, repositorio } = armar(parse);
    await expect(servicio.generar('q476', usuario)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repositorio.requerimiento).not.toHaveBeenCalled();
  });

  it('si la IA se niega, o la cuenta falla, no guarda y lo dice', async () => {
    const negada = armar(
      nuevoParse().mockResolvedValue(respuestaDe(null, 'refusal')),
    );
    await expect(
      negada.servicio.generar('q476', usuario),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const sinCupo = armar(
      nuevoParse().mockRejectedValue(
        new Anthropic.RateLimitError(429, undefined, 'sin cupo', new Headers()),
      ),
    );
    await expect(
      sinCupo.servicio.generar('q476', usuario),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sinCupo.quotations.update).not.toHaveBeenCalled();
  });
});
