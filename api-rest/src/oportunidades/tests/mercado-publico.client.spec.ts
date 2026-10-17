import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import {
  MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';

const TICKET = 'TICKET-DE-PRUEBA-0000';

const respuesta = (status: number, cuerpo: unknown = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Para mockImplementation: una respuesta NUEVA en cada llamada (el
 *  cuerpo de una Response se lee una sola vez). */
const siempre =
  (status: number, cuerpo: unknown = {}) =>
  () =>
    Promise.resolve(respuesta(status, cuerpo));

/** El error con que falla la promesa (y si no falla, la prueba cae). */
const fallaDe = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
  } catch (error) {
    return error as MercadoPublicoError;
  }
  throw new Error('se esperaba que fallara');
};

const paginaCompraAgil = (items: unknown[], totalPaginas = 1) =>
  respuesta(200, {
    success: 'OK',
    payload: { items, paginacion: { total_paginas: totalPaginas } },
  });

describe('MercadoPublicoClient', () => {
  const ticketAntes = process.env.MP_TICKET;
  let logger: ReturnType<typeof mockPinoLogger>;
  let cliente: MercadoPublicoClient;
  let fetchFalso: jest.SpyInstance;

  beforeEach(() => {
    process.env.MP_TICKET = TICKET;
    logger = mockPinoLogger();
    cliente = new MercadoPublicoClient(logger as unknown as PinoLogger);
    cliente.esperas = [0, 0];
    cliente.esperas429 = [0, 0];
    cliente.pausaMinimaMs = 0;
    cliente.pausaTrasChoqueMs = 0;
    cliente.pausaMaximaMs = 0;
    cliente.aumentoPorChoqueMs = 0;
    fetchFalso = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchFalso.mockRestore();
    if (ticketAntes === undefined) delete process.env.MP_TICKET;
    else process.env.MP_TICKET = ticketAntes;
  });

  const loQueSeRegistro = () =>
    JSON.stringify([
      logger.info.mock.calls,
      logger.warn.mock.calls,
      logger.error.mock.calls,
    ]);

  describe('reintentos (la lección del 504 de agosto)', () => {
    it('504, 504 y después 200: lo consigue al tercer intento', async () => {
      fetchFalso
        .mockResolvedValueOnce(respuesta(504))
        .mockResolvedValueOnce(respuesta(504))
        .mockResolvedValueOnce(
          respuesta(200, { Listado: [{ CodigoExterno: '4364-13-LE26' }] }),
        );
      await expect(cliente.licitacionesActivas()).resolves.toEqual([
        { CodigoExterno: '4364-13-LE26' },
      ]);
      expect(fetchFalso).toHaveBeenCalledTimes(3);
    });

    it('un corte de red se reintenta igual que un 5xx', async () => {
      fetchFalso
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(respuesta(200, { Listado: [] }));
      await expect(cliente.licitacionesActivas()).resolves.toEqual([]);
      expect(fetchFalso).toHaveBeenCalledTimes(2);
    });

    it('si nunca responde, se rinde tras 3 intentos con un error claro', async () => {
      fetchFalso.mockImplementation(siempre(504));
      const error = await fallaDe(cliente.licitacionesActivas());
      expect(error).toBeInstanceOf(MercadoPublicoError);
      expect(error.status).toBe(504);
      expect(error.message).toContain('licitaciones activas');
      expect(fetchFalso).toHaveBeenCalledTimes(3);
    });

    it('429: se espera y se reintenta; si sigue, es "sin cupo" y dice lo que respondió', async () => {
      fetchFalso.mockImplementation(
        siempre(429, { Mensaje: 'Excede el límite de solicitudes' }),
      );
      const error = await fallaDe(cliente.detalleLicitacion('X-1-LE26'));
      expect(error).toBeInstanceOf(MercadoPublicoError);
      expect(error.sinCupo).toBe(true);
      expect(error.message).toContain('Excede el límite de solicitudes');
      expect(fetchFalso).toHaveBeenCalledTimes(3);
    });

    it('un 429 pasajero no corta: al reintentar responde', async () => {
      fetchFalso
        .mockResolvedValueOnce(respuesta(429, {}))
        .mockResolvedValueOnce(
          respuesta(200, { Listado: [{ CodigoExterno: 'A-1-LE26' }] }),
        );
      await expect(cliente.detalleLicitacion('A-1-LE26')).resolves.toEqual({
        CodigoExterno: 'A-1-LE26',
      });
      expect(fetchFalso).toHaveBeenCalledTimes(2);
    });

    it('deja una pausa mínima entre dos pedidos', async () => {
      cliente.pausaMinimaMs = 40;
      const momentos: number[] = [];
      fetchFalso.mockImplementation(() => {
        momentos.push(Date.now());
        return Promise.resolve(respuesta(200, { Listado: [] }));
      });
      await cliente.detalleLicitacion('A');
      await cliente.detalleLicitacion('B');
      expect(momentos[1] - momentos[0]).toBeGreaterThanOrEqual(35);
    });

    it('un 4xx (pedido malo) no se reintenta', async () => {
      fetchFalso.mockImplementation(siempre(400));
      const error = await fallaDe(cliente.detalleLicitacion('X-1-LE26'));
      expect(error.status).toBe(400);
      expect(error.sinCupo).toBe(false);
      expect(fetchFalso).toHaveBeenCalledTimes(1);
    });
  });

  describe('el error que viene escrito dentro de la respuesta', () => {
    it('200 con { Codigo, Mensaje } es un error, no una respuesta vacía', async () => {
      fetchFalso.mockImplementation(
        siempre(200, { Codigo: 203, Mensaje: 'Ticket no válido.' }),
      );
      const error = await fallaDe(cliente.detalleLicitacion('X-1-LE26'));
      expect(error).toBeInstanceOf(MercadoPublicoError);
      expect(error.message).toContain('203');
      expect(error.message).toContain('Ticket no válido.');
      expect(fetchFalso).toHaveBeenCalledTimes(1);
    });

    it('"peticiones simultáneas" en un 429: pide más despacio y reintenta', async () => {
      cliente.pausaTrasChoqueMs = 5;
      cliente.pausaMaximaMs = 20;
      cliente.aumentoPorChoqueMs = 5;
      const simultaneas = {
        Mensaje:
          'Lo sentimos. Hemos detectado que existen peticiones simultáneas.',
      };
      fetchFalso
        .mockResolvedValueOnce(respuesta(429, simultaneas))
        .mockResolvedValueOnce(respuesta(429, simultaneas))
        .mockResolvedValueOnce(
          respuesta(200, { Listado: [{ CodigoExterno: 'A-1-LE26' }] }),
        );
      await expect(cliente.detalleLicitacion('A-1-LE26')).resolves.toEqual({
        CodigoExterno: 'A-1-LE26',
      });
      expect(fetchFalso).toHaveBeenCalledTimes(3);
      // 0 → 5 → 10 ms: cada choque le suma a la pausa, y se queda.
      expect(cliente.pausaMinimaMs).toBe(10);
      expect(logger.warn.mock.calls.join(' ')).toContain('pido cada');
    });

    it('si los choques no paran, se rinde con ese pedido (no es "sin cupo" por hoy)', async () => {
      cliente.maxChoques = 2;
      fetchFalso.mockImplementation(
        siempre(429, { Mensaje: 'peticiones simultáneas' }),
      );
      const error = await fallaDe(cliente.detalleLicitacion('A-1-LE26'));
      expect(error.message).toContain('simultáneas');
      expect(fetchFalso).toHaveBeenCalledTimes(3);
    });

    it('"peticiones simultáneas" se espera y se reintenta', async () => {
      cliente.pausaTrasChoqueMs = 5;
      cliente.pausaMaximaMs = 20;
      cliente.aumentoPorChoqueMs = 5;
      fetchFalso
        .mockResolvedValueOnce(
          respuesta(500, {
            Codigo: 10500,
            Mensaje:
              'Lo sentimos. Hemos detectado que existen peticiones simultáneas.',
          }),
        )
        .mockResolvedValueOnce(
          respuesta(200, { Listado: [{ CodigoExterno: 'A-1-LE26' }] }),
        );
      await expect(cliente.detalleLicitacion('A-1-LE26')).resolves.toEqual({
        CodigoExterno: 'A-1-LE26',
      });
      expect(fetchFalso).toHaveBeenCalledTimes(2);
      expect(logger.warn.mock.calls.join(' ')).toContain('simultáneas');
      expect(cliente.pausaMinimaMs).toBe(5);
    });

    it('la lista de activas sin "Listado" es una falla (siempre hay miles abiertas)', async () => {
      fetchFalso.mockImplementation(siempre(200, {}));
      await expect(cliente.licitacionesActivas()).rejects.toBeInstanceOf(
        MercadoPublicoError,
      );
    });
  });

  describe('el ticket', () => {
    it('si Mercado Público lo repitiera en un 429, se tacha', async () => {
      fetchFalso.mockImplementation(
        siempre(429, { Mensaje: `ticket ${TICKET} sin cupo` }),
      );
      const error = await fallaDe(cliente.detalleLicitacion('X-1-LE26'));
      expect(error.message).not.toContain(TICKET);
      expect(error.message).toContain('[ticket]');
      expect(loQueSeRegistro()).not.toContain(TICKET);
    });

    it('nunca aparece en un error ni en el registro', async () => {
      fetchFalso.mockImplementation(siempre(503));
      const error = await fallaDe(cliente.licitacionesActivas());
      expect(error.message).not.toContain(TICKET);
      expect(loQueSeRegistro()).not.toContain(TICKET);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('licitaciones: va en la URL; compra ágil: va en la cabecera, nunca en la URL', async () => {
      fetchFalso.mockImplementation(siempre(200, { Listado: [] }));
      await cliente.licitacionesActivas();
      const [urlLicitaciones] = fetchFalso.mock.calls[0];
      expect(String(urlLicitaciones)).toContain('estado=activas');
      expect(String(urlLicitaciones)).toContain(`ticket=${TICKET}`);

      fetchFalso.mockReset();
      fetchFalso.mockImplementation(() =>
        Promise.resolve(paginaCompraAgil([])),
      );
      await cliente.comprasAgiles('2026-10-14T10:00:00Z', [8, 16]);
      const [urlCompraAgil, opciones] = fetchFalso.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(String(urlCompraAgil)).not.toContain(TICKET);
      expect(String(urlCompraAgil)).toContain('estado=publicada');
      expect(opciones.headers.ticket).toBe(TICKET);
    });

    it('sin MP_TICKET no sale ninguna petición', async () => {
      delete process.env.MP_TICKET;
      expect(cliente.configurado).toBe(false);
      await expect(cliente.licitacionesActivas()).rejects.toBeInstanceOf(
        MercadoPublicoError,
      );
      expect(fetchFalso).not.toHaveBeenCalled();
    });
  });

  describe('licitacionesDelDia (la historia)', () => {
    it('pide por fecha, con el formato de la API', async () => {
      fetchFalso.mockImplementation(
        siempre(200, { Listado: [{ CodigoExterno: 'A' }] }),
      );
      await expect(cliente.licitacionesDelDia('03102025')).resolves.toEqual([
        { CodigoExterno: 'A' },
      ]);
      const [url] = fetchFalso.mock.calls[0] as [string];
      expect(url).toContain('fecha=03102025');
    });

    it('sin lista es una falla', async () => {
      fetchFalso.mockImplementation(siempre(200, {}));
      await expect(
        cliente.licitacionesDelDia('03102025'),
      ).rejects.toBeInstanceOf(MercadoPublicoError);
    });
  });

  describe('comprasAgiles', () => {
    it('recorre las páginas hasta la última', async () => {
      fetchFalso
        .mockResolvedValueOnce(paginaCompraAgil([{ codigo: 'A' }], 2))
        .mockResolvedValueOnce(paginaCompraAgil([{ codigo: 'B' }], 2));
      await expect(
        cliente.comprasAgiles('2026-10-14T10:00:00Z', [16]),
      ).resolves.toEqual([{ codigo: 'A' }, { codigo: 'B' }]);
      expect(fetchFalso).toHaveBeenCalledTimes(2);
    });

    it('si el servidor cae a la mitad, devuelve lo que ya trajo', async () => {
      fetchFalso
        .mockResolvedValueOnce(paginaCompraAgil([{ codigo: 'A' }], 3))
        .mockImplementation(siempre(503));
      await expect(
        cliente.comprasAgiles('2026-10-14T10:00:00Z', [16]),
      ).resolves.toEqual([{ codigo: 'A' }]);
    });

    it('una primera página "sin éxito" también es un error', async () => {
      fetchFalso.mockImplementation(
        siempre(200, { success: 'ERROR', errors: ['ticket'] }),
      );
      await expect(
        cliente.comprasAgiles('2026-10-14T10:00:00Z', [16]),
      ).rejects.toBeInstanceOf(MercadoPublicoError);
    });

    it('si cae en la primera página, avisa con error (no es "no hubo nada")', async () => {
      fetchFalso.mockImplementation(siempre(503));
      await expect(
        cliente.comprasAgiles('2026-10-14T10:00:00Z', [16]),
      ).rejects.toBeInstanceOf(MercadoPublicoError);
    });

    it('sin regiones no pregunta nada', async () => {
      await expect(
        cliente.comprasAgiles('2026-10-14T10:00:00Z', []),
      ).resolves.toEqual([]);
      expect(fetchFalso).not.toHaveBeenCalled();
    });
  });
});
