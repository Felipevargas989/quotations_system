import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';
import type { FacturaPedida } from '../facturas/borrador';
import { FacturasService } from '../facturas/facturas.service';

/**
 * EMITIR LA FACTURA DEL EVENTO (doc 19 §9.10, paso 2c), contra
 * facturacion.cl simulado: el folio que sigue, un envío a la vez, el «por
 * confirmar» si se corta, y lo que queda después (el PDF, la razón social
 * y la nota de BelIA).
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

const OC = {
  id: 12,
  numero: '1213301-49-AG26',
  fecha: '2026-05-15',
  rut: '69141400-0',
  razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  comprador: {
    giro: null,
    direccion: 'Calle 18 de Septiembre N°250',
    comuna: 'Quillón',
    ciudad: null,
  },
  descripcion: 'Servicio de Catering y Arriendo de Salón, Ciclo de Foros 2026',
  neto: 2084034,
  iva: 395966,
  total: 2480000,
  documento_id: null,
};

const PEDIDA: FacturaPedida = {
  orden_de_compra_id: 12,
  porcentaje: 100,
  monto: null,
  receptor: {
    rut: '69141400-0',
    razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
    giro: 'MUNICIPALIDAD',
    direccion: 'Calle 18 de Septiembre N°250',
    comuna: 'Quillón',
    ciudad: null,
    correo: null,
  },
  detalle: {
    descripcion:
      'Servicio de Catering y Arriendo de Salón, Ciclo de Foros 2026',
    descripcion_larga: null,
  },
  referencias: [{ tipo: '801', folio: '1213301-49-AG26', fecha: '2026-05-15' }],
  pedir_siempre: [],
};

const USUARIO = {
  id: 'u-felipe',
  company_id: 1,
  email: 'felipe@valledelsolquillon.cl',
  role: 'administrador',
} as never;

const armar = ({
  simulado = new FacturacionClSimulado({
    ultimoFolio: () => Promise.resolve(41),
  }),
  errorAlCrear = null as { code: string } | null,
} = {}) => {
  let fila: Record<string, unknown> = {};
  const repo = {
    eventoAFacturar: jest.fn().mockResolvedValue(EVENTO),
    ordenesDelEvento: jest.fn().mockResolvedValue([OC]),
    facturado: jest.fn().mockResolvedValue({ total: 0, porOC: new Map() }),
    nombreDelDocumento: jest.fn().mockResolvedValue(null),
    deCotizacion: jest.fn().mockResolvedValue([]),
    crear: jest.fn().mockImplementation((f: Record<string, unknown>) => {
      if (errorAlCrear)
        return Promise.reject(
          Object.assign(new Error('duplicado'), errorAlCrear),
        );
      fila = { id: 7, ...f, folio: null };
      return Promise.resolve(fila);
    }),
    actualizar: jest
      .fn()
      .mockImplementation((_id: number, _c: number, cambios: object) => {
        fila = { ...fila, ...cambios };
        return Promise.resolve(fila);
      }),
    guardarPdf: jest.fn().mockResolvedValue(undefined),
    agregarAlEvento: jest.fn().mockResolvedValue(undefined),
  };
  const ordenes = {
    empresaQueVende: jest
      .fn()
      .mockResolvedValue({ nombre: 'Valle del Sol Quillón SpA', rut: null }),
  };
  const razones = {
    deCliente: jest.fn().mockResolvedValue([]),
    crear: jest.fn().mockResolvedValue({}),
    editar: jest.fn().mockResolvedValue({}),
  };
  const bitacora = { crearComoBeliaAPedidoDe: jest.fn().mockResolvedValue({}) };
  const servicio = new FacturasService(
    repo as never,
    ordenes as never,
    { de: () => simulado } as never,
    razones as never,
    bitacora as never,
    mockPinoLogger() as never,
  );
  return { servicio, repo, razones, bitacora };
};

describe('Emitir la factura del evento', () => {
  it('sale con el folio que sigue y deja el PDF, la razón social nueva y la nota de BelIA', async () => {
    const { servicio, repo, razones, bitacora } = armar();
    const emitida = await servicio.emitir('ev-423', USUARIO, PEDIDA);

    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'enviando',
        ambiente: 'simulado',
        neto: 2084034,
        iva: 395966,
        total: 2480000,
        orden_de_compra_id: 12,
      }),
    );
    expect(emitida).toMatchObject({
      estado: 'emitido',
      folio: 42,
      pdf_path: 'c1/event-documents/ev-423/facturas/factura_42_simulado.pdf',
    });
    expect(repo.agregarAlEvento).toHaveBeenCalledWith(
      'ev-423',
      'Factura N° 42 (simulada).pdf',
      'c1/event-documents/ev-423/facturas/factura_42_simulado.pdf',
    );
    // El RUT era nuevo para el cliente: queda en su ficha (§9.12).
    expect(razones.crear).toHaveBeenCalledWith(
      'joker',
      1,
      expect.objectContaining({
        rut: '69141400-0',
        giro: 'MUNICIPALIDAD',
        comuna: 'Quillón',
      }),
      'u-felipe',
      'orden_de_compra',
    );
    expect(bitacora.crearComoBeliaAPedidoDe).toHaveBeenCalledWith(
      USUARIO,
      expect.objectContaining({
        note: 'Emitió la factura N° 42 por $2.480.000 a ILUSTRE MUNICIPALIDAD DE QUILLON, OC 1213301-49-AG26. Es simulada: no salió nada al SII.',
      }),
    );
  });

  it('con un dato que falta no se manda nada', async () => {
    const { servicio, repo } = armar();
    await expect(
      servicio.emitir('ev-423', USUARIO, {
        ...PEDIDA,
        receptor: { ...PEDIDA.receptor, giro: '' },
      }),
    ).rejects.toThrow(new BadRequestException('Falta el giro'));
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('un envío a la vez por evento', async () => {
    const { servicio } = armar({ errorAlCrear: { code: '23505' } });
    await expect(servicio.emitir('ev-423', USUARIO, PEDIDA)).rejects.toThrow(
      ConflictException,
    );
  });

  it('si se corta, queda «por confirmar» y no se reintenta (L5)', async () => {
    const { servicio, bitacora } = armar({
      simulado: new FacturacionClSimulado({ cortarEnElEnvio: true }),
    });
    const r = await servicio.emitir('ev-423', USUARIO, PEDIDA);
    expect(r).toMatchObject({ estado: 'por_confirmar' });
    expect(bitacora.crearComoBeliaAPedidoDe).not.toHaveBeenCalled();
  });

  it('si el folio ya existe (L3), pide otro una sola vez', async () => {
    const simulado = new FacturacionClSimulado({
      ultimoFolio: () => Promise.resolve(41),
    });
    // Alguien emitió en la web de facturacion.cl entre el folio y el envío.
    let primera = true;
    jest.spyOn(simulado, 'folioSiguiente').mockImplementation(() => {
      if (primera) {
        primera = false;
        return Promise.resolve(41);
      }
      return Promise.resolve(42);
    });
    const { servicio } = armar({ simulado });
    const r = await servicio.emitir('ev-423', USUARIO, PEDIDA);
    expect(r).toMatchObject({ estado: 'emitido', folio: 42 });
  });

  it('no se factura un evento que no está aceptado ni realizado', async () => {
    const { servicio, repo } = armar();
    repo.eventoAFacturar.mockResolvedValue({ ...EVENTO, estado: 'enviada' });
    await expect(servicio.emitir('ev-423', USUARIO, PEDIDA)).rejects.toThrow(
      'Se factura un evento aceptado o ya realizado',
    );
  });
});
