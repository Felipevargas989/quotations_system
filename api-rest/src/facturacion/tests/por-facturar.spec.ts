import { BadRequestException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';
import { PorFacturarService } from '../facturas/por-facturar.service';

/**
 * «POR FACTURAR» (doc 19 §9.21 y §9.24): los eventos aceptados o realizados
 * con algo por emitir, contado con la cadena, y lo ya facturado fuera de
 * Eventia, que va aparte. Salió de facturas.spec.ts el 07-11 junto con su
 * servicio (`PorFacturarService`).
 */

const EVENTO = {
  id: 'ev-423',
  numero: 423,
  estado: 'realizada',
  tipoDeEvento: 'Estadía y Alimentación',
  desde: '2026-08-11',
  hasta: '2026-08-15',
  personas: 40,
  total: 3440000,
  clientId: 'joker',
  cliente: 'JOKER SERVICIOS SPA',
};

const USUARIO = {
  id: 'u-felipe',
  company_id: 1,
  email: 'felipe@valledelsolquillon.cl',
  role: 'administrador',
} as never;

const armar = () => {
  const simulado = new FacturacionClSimulado({
    ultimoFolio: () => Promise.resolve(41),
  });
  const repo = {
    eventoAFacturar: jest.fn().mockResolvedValue(EVENTO),
    eventosDesde: jest.fn().mockResolvedValue([]),
    emitidoDeLosEventos: jest.fn().mockResolvedValue([]),
    ocsDeLosEventos: jest.fn().mockResolvedValue(new Map()),
    facturadosFuera: jest.fn().mockResolvedValue(new Map()),
    conFacturaEnDocumentos: jest.fn().mockResolvedValue(new Set()),
    marcarFacturadoFuera: jest.fn().mockResolvedValue(undefined),
    desmarcarFacturadoFuera: jest.fn().mockResolvedValue(undefined),
  };
  const boletas = { nombreDe: jest.fn().mockResolvedValue('Felipe') };
  const servicio = new PorFacturarService(
    repo as never,
    { de: () => simulado } as never,
    boletas as never,
    mockPinoLogger() as never,
  );
  return { servicio, repo, boletas };
};

describe('Por facturar (§9.21)', () => {
  const doc = (
    id: number,
    tipo: number,
    total: number,
    quotation_id: string,
    nota: { modifica_id: number; codigo_referencia: number } | null = null,
  ) => ({
    id,
    tipo,
    folio: id,
    estado: 'emitido',
    total,
    fecha_emision: '2026-11-01',
    modifica_id: nota?.modifica_id ?? null,
    codigo_referencia: nota?.codigo_referencia ?? null,
    orden_de_compra_id: null,
    quotation_id,
  });

  it('los eventos con algo por emitir: lo emitido con la cadena, y las boletas también cuentan', async () => {
    const { servicio, repo } = armar();
    const r = repo as unknown as Record<string, jest.Mock>;
    r.eventosDesde = jest.fn().mockResolvedValue([
      {
        id: 'ev-501',
        numero: 501,
        estado: 'aceptada',
        tipoDeEvento: 'Paseo fin de año',
        fecha: '2026-12-06',
        total: 1000000,
        cliente: 'CCU',
      },
      {
        id: 'ev-502',
        numero: 502,
        estado: 'realizada',
        tipoDeEvento: 'Matrimonio',
        fecha: '2026-10-20',
        total: 800000,
        cliente: 'Los novios',
      },
      {
        id: 'ev-503',
        numero: 503,
        estado: 'realizada',
        tipoDeEvento: 'Seminario',
        fecha: '2026-10-25',
        total: 500000,
        cliente: 'Municipalidad',
      },
    ]);
    r.emitidoDeLosEventos = jest.fn().mockResolvedValue([
      // La 501, con una factura de $400.000.
      doc(1, 33, 400000, 'ev-501'),
      // La 502, con una boleta por todo: no queda nada.
      doc(2, 39, 800000, 'ev-502'),
      // La 503, con su factura anulada por una NC: ya no cuenta.
      doc(3, 33, 500000, 'ev-503'),
      doc(4, 61, 500000, 'ev-503', { modifica_id: 3, codigo_referencia: 1 }),
    ]);
    r.ocsDeLosEventos = jest.fn().mockResolvedValue(new Map([['ev-501', 1]]));

    const lista = await servicio.porFacturar(1);
    expect(
      lista.eventos.map((e) => [e.numero, e.emitido, e.queda, e.ocs]),
    ).toEqual([
      [501, 400000, 600000, 1],
      [503, 0, 500000, 0],
    ]);
    expect(lista.ambiente).toBe('simulado');
    expect(r.eventosDesde).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(r.emitidoDeLosEventos).toHaveBeenCalledWith(1, 'simulado', [
      'ev-501',
      'ev-502',
      'ev-503',
    ]);
    expect(lista.facturados_fuera).toEqual([]);
  });

  it('lo facturado fuera de Eventia va aparte, y el PDF subido a mano se avisa (§9.24)', async () => {
    const { servicio, repo } = armar();
    const r = repo as unknown as Record<string, jest.Mock>;
    r.eventosDesde = jest.fn().mockResolvedValue([
      {
        id: 'ev-473',
        numero: 473,
        estado: 'realizada',
        tipoDeEvento: 'Seminario',
        fecha: '2026-08-10',
        total: 1245000,
        cliente: 'Municipalidad',
      },
      {
        id: 'ev-554',
        numero: 554,
        estado: 'realizada',
        tipoDeEvento: 'Almuerzo',
        fecha: '2026-10-21',
        total: 195300,
        cliente: 'CCU',
      },
    ]);
    r.emitidoDeLosEventos = jest.fn().mockResolvedValue([]);
    r.ocsDeLosEventos = jest.fn().mockResolvedValue(new Map());
    r.facturadosFuera.mockResolvedValue(
      new Map([['ev-473', { por: 'Felipe', en: '2026-11-07T20:00:00Z' }]]),
    );
    r.conFacturaEnDocumentos.mockResolvedValue(new Set(['ev-473']));

    const lista = await servicio.porFacturar(1);
    expect(lista.eventos.map((e) => e.numero)).toEqual([554]);
    expect(lista.eventos[0].tiene_factura_en_documentos).toBe(false);
    expect(lista.facturados_fuera).toEqual([
      expect.objectContaining({
        numero: 473,
        queda: 1245000,
        tiene_factura_en_documentos: true,
        marcado_por: 'Felipe',
        marcado_en: '2026-11-07T20:00:00Z',
      }),
    ]);
    expect(r.facturadosFuera).toHaveBeenCalledWith(1, ['ev-473', 'ev-554']);
  });
});

describe('«Ya está facturado» y «Devolver» (§9.24)', () => {
  it('marca el evento con el nombre de quien lo marca', async () => {
    const { servicio, repo, boletas } = armar();
    expect(await servicio.marcarFacturadoFuera('ev-423', USUARIO)).toEqual({
      ok: true,
    });
    expect(boletas.nombreDe).toHaveBeenCalledWith(USUARIO);
    expect(repo.marcarFacturadoFuera).toHaveBeenCalledWith(1, 'ev-423', {
      id: 'u-felipe',
      nombre: 'Felipe',
    });
  });

  it('solo un evento aceptado o realizado de la empresa', async () => {
    const { servicio, repo } = armar();
    repo.eventoAFacturar.mockResolvedValueOnce({
      ...EVENTO,
      estado: 'enviada',
    });
    await expect(
      servicio.marcarFacturadoFuera('ev-423', USUARIO),
    ).rejects.toBeInstanceOf(BadRequestException);
    repo.eventoAFacturar.mockResolvedValueOnce(null);
    await expect(
      servicio.marcarFacturadoFuera('ev-999', USUARIO),
    ).rejects.toThrow('Ese evento no existe');
    expect(repo.marcarFacturadoFuera).not.toHaveBeenCalled();
  });

  it('«Devolver» lo saca de lo facturado fuera', async () => {
    const { servicio, repo } = armar();
    await servicio.desmarcarFacturadoFuera('ev-423', USUARIO);
    expect(repo.desmarcarFacturadoFuera).toHaveBeenCalledWith(1, 'ev-423');
  });
});
