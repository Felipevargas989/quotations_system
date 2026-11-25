import { revisarArchivo } from '../facturacion-cl/simulado';
import {
  armarBorrador,
  revisarDte,
  type ContextoDeLaFactura,
  type OrdenAFacturar,
  type RazonSocialGuardada,
} from '../facturas/borrador';
import {
  lineaSolaDeLaOC,
  lineasPorFacturarDeLaOC,
  pideUnaFacturaPorLinea,
} from '../facturas/lineas-de-la-oc';
import { normalizada } from '../facturas/normalizada';

/**
 * UNA FACTURA POR LÍNEA DE LA OC (doc 19 §9.53), con el caso real del
 * 25-11-2026: la OC 4505522493 de Transportes CCU (#407, July Díaz), 4
 * líneas y 4 notas de pedido; cada factura lleva su línea, la OC (801) y su
 * nota de pedido (802).
 */

const LINEAS = [4068213, 224716, 130796, 93920].map((precio) => ({
  descripcion: 'arriendo recinto y alimentacion FFNN 202',
  cantidad: 1,
  precio,
  con_iva: false,
}));

const TRANSPORTES_CCU: RazonSocialGuardada = {
  id: 7,
  rut: '79862750-3',
  razon_social: 'Transportes CCU Limitada',
  giro: 'TRANSPORTE DE CARGA POR CARRETERA',
  direccion: 'Av. Eduardo Frei Montalva 8000, Quilicura 13',
  comuna: 'Quilicura',
  ciudad: 'STGO',
  correo_facturacion: null,
  referencias_exigidas: ['801', '802'],
};

const OC: OrdenAFacturar = {
  id: 16,
  numero: '4505522493',
  fecha: '2026-11-24',
  rut: '79862750-3',
  razon_social: 'Transportes CCU Limitada',
  comprador: null,
  descripcion: 'arriendo recinto y alimentacion FFNN 202',
  lineas: LINEAS,
  neto: 4517645,
  iva: 858352,
  total: 5375997,
  facturado: 0,
  lineasFacturadas: [],
  pdf: null,
};

const contexto = (
  cambios: Partial<ContextoDeLaFactura> = {},
): ContextoDeLaFactura => ({
  evento: {
    id: 'ev-407',
    numero: 407,
    estado: 'aceptada',
    tipoDeEvento: 'Paseo fin de año',
    desde: '2026-12-13',
    hasta: null,
    personas: 400,
    total: 19262800,
    clientId: 'ccu',
    cliente: 'CCU',
  },
  oc: OC,
  razones: [TRANSPORTES_CCU],
  facturadoDelEvento: 0,
  totalDeLasOC: 5375997,
  ...cambios,
});

/** Lo que guarda una factura emitida de una línea: su detalle en neto. */
const emitidaDeLaLinea = (neto: number) => [
  {
    descripcion: 'arriendo recinto y alimentacion FFNN 202',
    cantidad: 1,
    precio: neto,
  },
];

describe('una factura por línea de la OC (§9.53)', () => {
  it('va por línea con más de una línea y si el receptor pide la nota de pedido', () => {
    expect(pideUnaFacturaPorLinea({ lineas: LINEAS }, ['801', '802'])).toBe(
      true,
    );
    // Santo Tomás o Ecofor: varias líneas, sin nota de pedido: como antes.
    expect(pideUnaFacturaPorLinea({ lineas: LINEAS }, ['801'])).toBe(false);
    expect(pideUnaFacturaPorLinea({ lineas: LINEAS }, null)).toBe(false);
    // Una sola línea: una factura, aunque pida la nota de pedido (#408).
    expect(pideUnaFacturaPorLinea({ lineas: [LINEAS[0]] }, ['802'])).toBe(
      false,
    );
  });

  it('sin facturas, las cuatro líneas están por facturar', () => {
    expect(lineasPorFacturarDeLaOC({ lineas: LINEAS }, [])).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('cada factura de una línea calza con su línea por cantidad y precio', () => {
    expect(
      lineasPorFacturarDeLaOC({ lineas: LINEAS }, [
        emitidaDeLaLinea(130796),
        emitidaDeLaLinea(4068213),
      ]),
    ).toEqual([1, 3]);
    // Las cuatro: no queda ninguna.
    expect(
      lineasPorFacturarDeLaOC(
        { lineas: LINEAS },
        LINEAS.map((l) => emitidaDeLaLinea(l.precio)),
      ),
    ).toEqual([]);
  });

  it('una factura de varias líneas, o que no calza, deja la OC como antes', () => {
    expect(
      lineasPorFacturarDeLaOC({ lineas: LINEAS }, [
        [...emitidaDeLaLinea(4068213), ...emitidaDeLaLinea(224716)],
      ]),
    ).toBeNull();
    expect(
      lineasPorFacturarDeLaOC({ lineas: LINEAS }, [emitidaDeLaLinea(1000)]),
    ).toBeNull();
    // Rebajada por una NC de monto: no se sabe qué línea cubre.
    expect(lineasPorFacturarDeLaOC({ lineas: LINEAS }, null)).toBeNull();
  });

  it('la línea sola va entera, con su precio con IVA', () => {
    expect(lineaSolaDeLaOC({ lineas: LINEAS }, 1)).toEqual({
      descripcion: 'arriendo recinto y alimentacion FFNN 202',
      descripcion_larga: null,
      cantidad: 1,
      precio: 267412,
    });
    expect(lineaSolaDeLaOC({ lineas: LINEAS }, 4)).toBeNull();
  });

  it('el borrador de la línea 2: solo esa línea, la OC y la nota de pedido por llenar', () => {
    const { pedida } = armarBorrador(contexto({ lineaDeLaOC: 1 }));
    expect(pedida.linea_de_la_oc).toBe(1);
    expect(pedida.orden_de_compra_id).toBe(16);
    expect(pedida.lineas).toEqual([
      expect.objectContaining({ cantidad: 1, precio: 267412 }),
    ]);
    expect(pedida.referencias).toEqual([
      { tipo: '801', folio: '4505522493', fecha: '2026-11-24' },
      { tipo: '802', folio: '', fecha: '' },
    ]);
  });

  it('con su nota de pedido, la factura de la línea 1 sale por $4.841.173', () => {
    const { pedida } = armarBorrador(contexto({ lineaDeLaOC: 0 }));
    const lista = normalizada({
      ...pedida,
      referencias: [
        { tipo: '801', folio: '4505522493', fecha: '2026-11-24' },
        { tipo: '802', folio: '5025614263', fecha: '2026-11-25' },
      ],
    });
    expect(lista.linea_de_la_oc).toBe(0);
    const r = revisarDte(lista, contexto(), 398, '2026-11-25');
    expect(r.faltan).toEqual([]);
    expect(r.problemas).toEqual([]);
    expect(r.montos).toMatchObject({
      neto: 4068213,
      iva: 772960,
      total: 4841173,
    });
    expect(r.ok).toBe(true);
    expect(revisarArchivo(r.archivo ?? '')).toMatchObject({ tipo: 33 });
  });

  it('sin la línea, el borrador sigue siendo el de toda la OC, como antes', () => {
    const { pedida } = armarBorrador(contexto());
    expect(pedida.linea_de_la_oc).toBeNull();
    expect(pedida.lineas).toHaveLength(4);
  });

  it('la boleta o la factura sin OC no llevan la línea', () => {
    const { pedida } = armarBorrador(contexto({ lineaDeLaOC: 0 }));
    expect(normalizada({ ...pedida, tipo: 39 }).linea_de_la_oc).toBeNull();
    expect(
      normalizada({ ...pedida, orden_de_compra_id: null }).linea_de_la_oc,
    ).toBeNull();
  });
});
