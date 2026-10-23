import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { CompetenciaRepository } from '../competencia/competencia.repository';
import {
  camposDeLosCotizantes,
  cotizantesDeCompraAgil,
} from '../competencia/cotizantes';
import { CotizantesService } from '../competencia/cotizantes.service';
import {
  type MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';

// QUIÉN COTIZÓ EN UNA COMPRA ÁGIL (decisión 71, 23-10): la medición acordada
// con Felipe. Mercado Público trae `proveedores_cotizando`; abierta viene
// vacía. Se guarda lo que diga al cerrar y, si trae RUT, entra como oferta.

const PROCESO = {
  codigo: '1346350-37-COT26',
  nombre: 'Catamarán',
  organismo_codigo: '1346350',
  organismo: 'Municipalidad de Quillón',
  region: 'Ñuble',
  comuna: 'Quillón',
  fecha_publicacion: '2026-10-20T12:00:00Z',
};

describe('Quién cotizó', () => {
  it('solo entra quien trae un RUT válido; el nombre, el monto y si fue elegido se buscan por el nombre del campo', () => {
    const filas = cotizantesDeCompraAgil(
      {
        proveedores_cotizando: [
          {
            rut_proveedor: '77.701.305-k',
            razon_social: 'VALLE DEL SOL',
            monto_total: '7.150.000',
            seleccionado: true,
          },
          { rutProveedor: 77067895, nombre: 'SOL' },
          {
            rut: '76.111.222-3',
            nombre_proveedor: 'OTRO',
            total: 6_500_000,
            adjudicado: 'no',
          },
          { nombre: 'SIN RUT' },
          'basura',
        ],
      },
      PROCESO,
    );
    expect(
      filas.map((f) => [f.rut, f.proveedor, f.total_ofertado, f.adjudicada]),
    ).toEqual([
      ['77701305-K', 'VALLE DEL SOL', 7_150_000, true],
      ['76111222-3', 'OTRO', 6_500_000, false],
    ]);
    expect(filas[0]).toMatchObject({
      codigo: PROCESO.codigo,
      total_adjudicado: 7_150_000,
      lineas: 1,
      fecha: '2026-10-20',
    });
    expect(
      cotizantesDeCompraAgil({ proveedores_cotizando: [] }, PROCESO),
    ).toEqual([]);
    expect(cotizantesDeCompraAgil(null, PROCESO)).toEqual([]);
  });

  it('para el registro, solo los nombres de los campos (no los datos)', () => {
    expect(
      camposDeLosCotizantes({
        proveedores_cotizando: [{ rut: '1-9', monto: 1 }],
      }),
    ).toEqual(['monto', 'rut']);
    expect(camposDeLosCotizantes({ proveedores_cotizando: [] })).toEqual([]);
  });
});

function armar() {
  const repo = {
    comprasAgilesPorRevisar: jest.fn().mockResolvedValue([
      {
        ...PROCESO,
        fecha_cierre: '2026-10-23T16:00:00Z',
        cotizantes_leidos_en: null,
      },
      {
        ...PROCESO,
        codigo: 'OTRA-COT26',
        fecha_cierre: '2026-10-22T16:00:00Z',
        cotizantes_leidos_en: null,
      },
    ]),
    guardarCotizantes: jest.fn().mockResolvedValue(undefined),
    guardarOfertas: jest.fn().mockResolvedValue(undefined),
  };
  const mp = { detalleCompraAgil: jest.fn() };
  const servicio = new CotizantesService(
    repo as unknown as CompetenciaRepository,
    mp as unknown as MercadoPublicoClient,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, repo, mp };
}

describe('Las compras ágiles cerradas de la empresa', () => {
  it('guarda lo que dijo Mercado Público y, si trae RUT, las ofertas', async () => {
    const { servicio, repo, mp } = armar();
    mp.detalleCompraAgil
      .mockResolvedValueOnce({
        proveedores_cotizando: [{ rut: '77.701.305-K', monto: 7_000_000 }],
        id_orden_compra: '1346350-99-AG26',
        estado: { codigo: 'oc_emitida' },
      })
      .mockResolvedValueOnce({
        proveedores_cotizando: [],
        id_orden_compra: null,
      });
    expect(await servicio.revisar(1, Date.now() + 60_000)).toBe(1);
    expect(repo.guardarCotizantes).toHaveBeenNthCalledWith(1, PROCESO.codigo, {
      proveedores_cotizando: [{ rut: '77.701.305-K', monto: 7_000_000 }],
      id_orden_compra: '1346350-99-AG26',
      estado: { codigo: 'oc_emitida' },
    });
    expect(repo.guardarOfertas).toHaveBeenCalledTimes(1);
    expect(repo.guardarOfertas).toHaveBeenCalledWith(PROCESO.codigo, [
      expect.objectContaining({ rut: '77701305-K', total_ofertado: 7_000_000 }),
    ]);
    expect(repo.guardarCotizantes).toHaveBeenCalledTimes(2);
  });

  it('sin cupo en Mercado Público para ahí, para no gastar más', async () => {
    const { servicio, mp, repo } = armar();
    mp.detalleCompraAgil.mockRejectedValue(
      new MercadoPublicoError('sin cupo', 429),
    );
    expect(await servicio.revisar(1, Date.now() + 60_000)).toBe(0);
    expect(mp.detalleCompraAgil).toHaveBeenCalledTimes(1);
    expect(repo.guardarCotizantes).not.toHaveBeenCalled();
  });
});
