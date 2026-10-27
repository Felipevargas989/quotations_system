import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import { CompetenciaCronService } from '../competencia/competencia-cron.service';
import type { CompetenciaRepository } from '../competencia/competencia.repository';
import { resultadoDeCompraAgil } from '../competencia/resultado-compra-agil';
import type { ResultadosRepository } from '../competencia/resultados.repository';
import { ResultadosDeComprasAgilesService } from '../competencia/resultados.service';
import {
  type MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';

// EL RESULTADO DE LAS COMPRAS ÁGILES POSTULADAS (decisión 92 del doc 17,
// 27-10). Felipe perdió la del catamarán (1346350-37-COT26) y Eventia no le
// avisó. Cuando el comprador elige, el detalle oficial trae todas las
// ofertas; se comparan como manda la ley en una compra ágil (decisión 93):
// por precio.

type Cotizacion = Record<string, unknown>;

const BPM: Cotizacion = {
  id_oc: 55732521,
  estado: 2,
  valor_neto: 5714286,
  monto_total: 6800000,
  razon_social: 'BPM EVENTOS SPA',
  rut_proveedor: '76.430.926-k',
  nombre_impuesto: 'IVA',
  proveedor_seleccionado: 1,
  justificacion_inadmisibilidad: null,
};

const VDS: Cotizacion = {
  id_oc: null,
  estado: 2,
  valor_neto: 5957983,
  monto_total: 7090000,
  razon_social: 'VALLE DEL SOL QUILLON SPA',
  rut_proveedor: '77.701.305-K',
  nombre_impuesto: 'IVA',
  proveedor_seleccionado: 0,
  justificacion_inadmisibilidad: null,
};

/** El detalle del catamarán con «Proveedor seleccionado», como llegó el
 *  27-10 (recortado): `id_orden_compra` es un número interno. */
const detalleCon = (...cotizaciones: Cotizacion[]) => ({
  estado: {
    glosa: 'Proveedor seleccionado',
    codigo: 'proveedor_seleccionado',
    id_estado: 4,
  },
  id_orden_compra: 55732521,
  proveedores_cotizando: cotizaciones,
});

const CATAMARAN = detalleCon(BPM, VDS);

describe('el resultado de una compra ágil (decisión 92)', () => {
  it('perdida: quién ganó, por cuánto y en qué lugar quedó la empresa por precio', () => {
    expect(resultadoDeCompraAgil(CATAMARAN, '77.701.305-K')).toEqual({
      estado: 'perdida',
      proveedor: 'BPM EVENTOS SPA',
      rut_proveedor: '76.430.926-k',
      monto: 6800000,
      mi_monto: 7090000,
      lugar: 2,
      ofertas: 2,
      era_la_mas_barata: false,
      inadmisible: null,
    });
  });

  it('ganada si eligieron a la empresa, aunque el RUT venga escrito distinto', () => {
    expect(
      resultadoDeCompraAgil(
        detalleCon(
          { ...BPM, proveedor_seleccionado: 0 },
          { ...VDS, proveedor_seleccionado: 1 },
        ),
        '77701305-k',
      ),
    ).toMatchObject({
      estado: 'ganada',
      proveedor: 'VALLE DEL SOL QUILLON SPA',
      monto: 7090000,
      lugar: 2,
      era_la_mas_barata: false,
    });
  });

  it('si la empresa tenía el menor precio y eligieron a otro, queda marcado', () => {
    expect(
      resultadoDeCompraAgil(
        detalleCon(BPM, { ...VDS, monto_total: 6500000 }),
        '77.701.305-K',
      ),
    ).toMatchObject({ estado: 'perdida', lugar: 1, era_la_mas_barata: true });
  });

  it('una oferta inadmisible no se compara: la de la empresa dice por qué', () => {
    expect(
      resultadoDeCompraAgil(
        detalleCon(BPM, {
          ...VDS,
          monto_total: 6500000,
          justificacion_inadmisibilidad: 'No adjunta la cotización formal',
        }),
        '77.701.305-K',
      ),
    ).toMatchObject({
      estado: 'perdida',
      mi_monto: 6500000,
      lugar: null,
      ofertas: 1,
      era_la_mas_barata: false,
      inadmisible: 'No adjunta la cotización formal',
    });
  });

  it('mientras no eligen, o sin el RUT de la empresa, no hay resultado', () => {
    expect(
      resultadoDeCompraAgil(
        {
          estado: { glosa: 'Cerrada', id_estado: 3 },
          id_orden_compra: null,
          proveedores_cotizando: [],
        },
        '77.701.305-K',
      ),
    ).toBeNull();
    expect(
      resultadoDeCompraAgil(
        detalleCon({ ...BPM, proveedor_seleccionado: 0 }, VDS),
        '77.701.305-K',
      ),
    ).toBeNull();
    expect(resultadoDeCompraAgil(CATAMARAN, null)).toBeNull();
    expect(resultadoDeCompraAgil(null, '77.701.305-K')).toBeNull();
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
    detalleCompraAgil: jest.fn().mockResolvedValue(CATAMARAN),
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
  it('eligieron a otro: perdida, con quién ganó, por cuánto y tu lugar, una sola vez', async () => {
    const { resultados, competencia, servicio } = armar();

    await expect(servicio.revisar(1, enUnRato())).resolves.toBe(1);

    expect(competencia.guardarCotizantes).toHaveBeenCalledWith(
      '1346350-37-COT26',
      expect.objectContaining({ id_orden_compra: 55732521 }),
    );
    expect(resultados.marcarResultado).toHaveBeenCalledWith(1, 3219, 'perdida');
    expect(resultados.registrarResultado).toHaveBeenCalledWith(
      '1346350-37-COT26',
      expect.objectContaining({
        estado: 'perdida',
        proveedor: 'BPM EVENTOS SPA',
        monto: 6800000,
        mi_monto: 7090000,
        lugar: 2,
      }),
    );
  });

  it('eligieron a la empresa: ganada', async () => {
    const { resultados, mp, servicio } = armar();
    mp.detalleCompraAgil.mockResolvedValue(
      detalleCon(
        { ...BPM, proveedor_seleccionado: 0 },
        { ...VDS, proveedor_seleccionado: 1 },
      ),
    );
    await servicio.revisar(1, enUnRato());
    expect(resultados.marcarResultado).toHaveBeenCalledWith(1, 3219, 'ganada');
  });

  it('cerrada y sin elegir todavía: se guarda lo leído y se espera a la próxima pasada', async () => {
    const { resultados, competencia, mp, servicio } = armar();
    mp.detalleCompraAgil.mockResolvedValue({
      estado: { glosa: 'Cerrada' },
      id_orden_compra: null,
      proveedores_cotizando: [],
    });
    await expect(servicio.revisar(1, enUnRato())).resolves.toBe(0);
    expect(competencia.guardarCotizantes).toHaveBeenCalled();
    expect(resultados.marcarResultado).not.toHaveBeenCalled();
  });

  it('si la empresa ya la marcó a mano, no se anota otra vez', async () => {
    const { resultados, servicio } = armar();
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
