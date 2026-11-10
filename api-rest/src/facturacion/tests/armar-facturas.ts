import { mockPinoLogger } from '../../testing/mocks';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';
import type { DtePedido } from '../facturas/borrador';
import { FacturasService } from '../facturas/facturas.service';

/**
 * EL ARMADO DE LAS PRUEBAS DE `FacturasService` (salió de
 * `facturas.spec.ts` el 10-11, cuando ese archivo llegó a las 800 líneas
 * del portero): el evento, su OC, el pedido, el usuario y el servicio
 * contra facturacion.cl simulado, con sus piezas de mentira.
 */

export const EVENTO = {
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

export const OC = {
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

export const PEDIDA: DtePedido = {
  tipo: 33,
  orden_de_compra_id: 12,
  receptor: {
    rut: '69141400-0',
    razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
    giro: 'MUNICIPALIDAD',
    direccion: 'Calle 18 de Septiembre N°250',
    comuna: 'Quillón',
    ciudad: null,
    correo: null,
  },
  lineas: [
    {
      descripcion:
        'Servicio de Catering y Arriendo de Salón, Ciclo de Foros 2026',
      descripcion_larga: null,
      cantidad: 1,
      precio: 2480000,
    },
  ],
  referencias: [{ tipo: '801', folio: '1213301-49-AG26', fecha: '2026-05-15' }],
  pedir_siempre: [],
};

export const USUARIO = {
  id: 'u-felipe',
  company_id: 1,
  email: 'felipe@valledelsolquillon.cl',
  role: 'administrador',
} as never;

export const armar = ({
  simulado = new FacturacionClSimulado({
    ultimoFolio: () => Promise.resolve(41),
  }),
  errorAlCrear = null as { code: string } | null,
  // Los tipos de cliente particulares (doc 21); sin ellos, como antes.
  particulares = null as string[] | null,
  // La nómina del SII (§9.27); sin ella, como antes.
  sii = undefined as { buscar: jest.Mock } | undefined,
  // La caja de recepción (§9.43); sin ella, como antes.
  caja = undefined as { turnoAbierto: jest.Mock } | undefined,
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
    // §9.35: el cliente como está en Eventia, la cotización y la OC.
    datosDelNombreDelPdf: jest.fn().mockResolvedValue({
      receptor: { razon_social: 'Compañía Cervecerías Unidas S.A.' },
      cotizacion: { quotation_number: 423, cliente: { name: 'CCU Quillón' } },
      oc: { numero: '4500918822' },
    }),
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
  const ocs = {
    deDocumentos: jest.fn().mockResolvedValue({ ordenes: [OC], sinLeer: [] }),
  };
  const boletas = {
    emitirDelEvento: jest.fn().mockResolvedValue({
      id: 8,
      tipo: 39,
      ambiente: 'simulado',
      estado: 'emitido',
      folio: 1021,
      total: 2480000,
    }),
    // §9.23: el tarifario de la factura de «Nuevo documento».
    tarifario: jest.fn().mockResolvedValue([
      {
        id: 5,
        nombre: 'Cabaña 6 personas, temporada media',
        precio: 140000,
        unidad: 'noche',
        activo: true,
      },
    ]),
  };
  const alcance = particulares
    ? { particulares: jest.fn().mockResolvedValue(new Set(particulares)) }
    : undefined;
  const servicio = new FacturasService(
    repo as never,
    ordenes as never,
    { de: () => simulado } as never,
    razones as never,
    bitacora as never,
    mockPinoLogger() as never,
    ocs as never,
    boletas as never,
    alcance as never,
    sii as never,
    caja as never,
  );
  return { servicio, repo, razones, bitacora, ocs, boletas, simulado };
};
