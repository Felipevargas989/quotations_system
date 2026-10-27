import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import { CompetenciaCronService } from '../competencia/competencia-cron.service';
import type { CompetenciaRepository } from '../competencia/competencia.repository';
import {
  ordenDelDetalle,
  resultadoDeLaOrden,
} from '../competencia/resultado-compra-agil';
import type { ResultadosRepository } from '../competencia/resultados.repository';
import { ResultadosDeComprasAgilesService } from '../competencia/resultados.service';
import {
  type MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import type { OferenteRepository } from '../oferente/oferente.repository';
import {
  bajarOrdenDeCompra,
  leerOrdenDeCompra,
} from '../oferente/orden-de-compra';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { FICHA_DE_LA_ORDEN } from './orden-de-compra-de-prueba';

// EL RESULTADO DE LAS COMPRAS ÁGILES POSTULADAS (decisión 92 del doc 17,
// 27-10). Felipe perdió la del catamarán (1346350-37-COT26) y Eventia no le
// avisó: ahora, cuando la compra ágil trae su orden de compra, se lee su
// ficha pública y la oportunidad queda ganada o perdida.

jest.mock('../oferente/orden-de-compra', () => {
  const real = jest.requireActual<typeof import('../oferente/orden-de-compra')>(
    '../oferente/orden-de-compra',
  );
  return { ...real, bajarOrdenDeCompra: jest.fn() };
});

const bajar = jest.mocked(bajarOrdenDeCompra);

/** La ficha de una orden para otro proveedor. */
const DE_OTRO = FICHA_DE_LA_ORDEN.replace(
  '77.701.305-K',
  '76.123.456-7',
).replace('VALLE DEL SOL QUILLON SPA', 'EVENTOS DEL LAGO SPA');

const ORDEN = leerOrdenDeCompra(FICHA_DE_LA_ORDEN)!;

describe('el resultado de una compra ágil (decisión 92)', () => {
  it('el número de la orden sale del detalle solo si tiene forma de orden', () => {
    expect(ordenDelDetalle({ id_orden_compra: '1346350-45-AG26' })).toBe(
      '1346350-45-AG26',
    );
    expect(ordenDelDetalle({ id_orden_compra: ' 4352-103-SE23 ' })).toBe(
      '4352-103-SE23',
    );
    expect(ordenDelDetalle({ id_orden_compra: null })).toBeNull();
    expect(ordenDelDetalle({ id_orden_compra: 98765 })).toBeNull();
    expect(ordenDelDetalle({})).toBeNull();
    expect(ordenDelDetalle(null)).toBeNull();
  });

  it('ganada si la orden es para la empresa, aunque el RUT venga escrito distinto; perdida si es para otro', () => {
    expect(resultadoDeLaOrden(ORDEN, '77701305-k')).toEqual({
      estado: 'ganada',
      orden_de_compra: '4352-103-SE23',
      proveedor: 'VALLE DEL SOL QUILLON SPA',
      rut_proveedor: '77.701.305-K',
      monto: 11_782_499,
      fecha: '2023-10-20',
    });
    expect(
      resultadoDeLaOrden(leerOrdenDeCompra(DE_OTRO)!, '77.701.305-K'),
    ).toMatchObject({
      estado: 'perdida',
      proveedor: 'EVENTOS DEL LAGO SPA',
      rut_proveedor: '76.123.456-7',
    });
  });

  it('sin el RUT de la orden o el de la empresa no se sabe', () => {
    expect(
      resultadoDeLaOrden({ ...ORDEN, rut_proveedor: null }, '77.701.305-K'),
    ).toBeNull();
    expect(resultadoDeLaOrden(ORDEN, null)).toBeNull();
  });
});

function armar() {
  const resultados = {
    comprasAgilesPostuladas: jest
      .fn()
      .mockResolvedValue([{ id: 3219, codigo: '1346350-37-COT26' }]),
    marcarResultado: jest.fn().mockResolvedValue(true),
    registrarResultado: jest.fn().mockResolvedValue(undefined),
  };
  const competencia = {
    guardarCotizantes: jest.fn().mockResolvedValue(undefined),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({ rut: '77.701.305-K' }),
  };
  const mp = {
    detalleCompraAgil: jest.fn().mockResolvedValue({
      estado: { glosa: 'OC emitida' },
      id_orden_compra: '1346350-45-AG26',
      proveedores_cotizando: [],
    }),
  };
  const servicio = new ResultadosDeComprasAgilesService(
    resultados as unknown as ResultadosRepository,
    competencia as unknown as CompetenciaRepository,
    oferente as unknown as OferenteRepository,
    mp as unknown as MercadoPublicoClient,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { resultados, competencia, oferente, mp, servicio };
}

const enUnRato = () => Date.now() + 60_000;

describe('ResultadosDeComprasAgilesService — revisar', () => {
  beforeEach(() => bajar.mockReset());

  it('la orden es de otro: perdida, con quién ganó y por cuánto, una sola vez', async () => {
    const { resultados, competencia, servicio } = armar();
    bajar.mockResolvedValue(DE_OTRO);

    await expect(servicio.revisar(1, enUnRato())).resolves.toBe(1);

    expect(bajar).toHaveBeenCalledWith('1346350-45-AG26');
    expect(competencia.guardarCotizantes).toHaveBeenCalledWith(
      '1346350-37-COT26',
      expect.objectContaining({ id_orden_compra: '1346350-45-AG26' }),
    );
    expect(resultados.marcarResultado).toHaveBeenCalledWith(1, 3219, 'perdida');
    expect(resultados.registrarResultado).toHaveBeenCalledWith(
      '1346350-37-COT26',
      expect.objectContaining({
        estado: 'perdida',
        proveedor: 'EVENTOS DEL LAGO SPA',
        monto: 11_782_499,
      }),
    );
  });

  it('la orden es de la empresa: ganada', async () => {
    const { resultados, servicio } = armar();
    bajar.mockResolvedValue(FICHA_DE_LA_ORDEN);
    await servicio.revisar(1, enUnRato());
    expect(resultados.marcarResultado).toHaveBeenCalledWith(1, 3219, 'ganada');
  });

  it('sin orden de compra todavía: se guarda lo leído y se espera a la próxima pasada', async () => {
    const { resultados, competencia, mp, servicio } = armar();
    mp.detalleCompraAgil.mockResolvedValue({
      estado: { glosa: 'Cerrada' },
      id_orden_compra: null,
      proveedores_cotizando: [],
    });
    await expect(servicio.revisar(1, enUnRato())).resolves.toBe(0);
    expect(competencia.guardarCotizantes).toHaveBeenCalled();
    expect(bajar).not.toHaveBeenCalled();
    expect(resultados.marcarResultado).not.toHaveBeenCalled();
  });

  it('si la empresa ya la marcó a mano, no se anota otra vez', async () => {
    const { resultados, servicio } = armar();
    bajar.mockResolvedValue(DE_OTRO);
    resultados.marcarResultado.mockResolvedValue(false);
    await expect(servicio.revisar(1, enUnRato())).resolves.toBe(0);
    expect(resultados.registrarResultado).not.toHaveBeenCalled();
  });

  it('sin postuladas no pregunta nada; sin cupo de Mercado Público, para', async () => {
    const vacio = armar();
    vacio.resultados.comprasAgilesPostuladas.mockResolvedValue([]);
    await expect(vacio.servicio.revisar(1, enUnRato())).resolves.toBe(0);
    expect(vacio.mp.detalleCompraAgil).not.toHaveBeenCalled();

    const { resultados, mp, servicio } = armar();
    resultados.comprasAgilesPostuladas.mockResolvedValue([
      { id: 1, codigo: 'A-1-COT26' },
      { id: 2, codigo: 'A-2-COT26' },
    ]);
    mp.detalleCompraAgil.mockRejectedValue(
      new MercadoPublicoError('sin cupo', 429),
    );
    await expect(servicio.revisar(1, enUnRato())).resolves.toBe(0);
    expect(mp.detalleCompraAgil).toHaveBeenCalledTimes(1);
  });
});

describe('el reloj de los resultados (decisión 92)', () => {
  it('revisa cada empresa con el módulo; sin el servicio, no hace nada', async () => {
    const oportunidades = {
      empresasConModulo: jest.fn().mockResolvedValue([{ id: 1 }, { id: 7 }]),
    };
    const resultados = {
      revisar: jest
        .fn<Promise<number>, [number, number]>()
        .mockResolvedValue(0),
    };
    const reloj = new CompetenciaCronService(
      oportunidades as unknown as OportunidadesRepository,
      {} as never,
      {} as never,
      {} as never,
      mockPinoLogger() as unknown as PinoLogger,
      resultados as unknown as ResultadosDeComprasAgilesService,
    );
    await reloj.resultadosDeLasPostuladas();
    expect(resultados.revisar.mock.calls.map((c) => c[0])).toEqual([1, 7]);

    const sinServicio = new CompetenciaCronService(
      oportunidades as unknown as OportunidadesRepository,
      {} as never,
      {} as never,
      {} as never,
      mockPinoLogger() as unknown as PinoLogger,
    );
    await expect(
      sinServicio.resultadosDeLasPostuladas(),
    ).resolves.toBeUndefined();
  });
});
