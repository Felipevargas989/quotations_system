import { precioNetoDe } from '../archivo/montos';
import {
  armarBorrador,
  revisarDte,
  type ContextoDeLaFactura,
  type OrdenAFacturar,
} from '../facturas/borrador';
import {
  cuadrarConLoQueQueda,
  lineasDeLaOC,
  precioConIvaDe,
} from '../facturas/lineas-de-la-oc';
import { propuestaDeLaLectura } from '../ordenes-de-compra/leer-orden-de-compra';

/**
 * LA FACTURA CON LAS LÍNEAS DE SU OC (doc 19 §9.37). Felipe, 08-11, con la
 * OC N° 33000132942 del CFT Santo Tomás (#481): MENU ADULTO 78 × $46.218 y
 * MENU NIÑOS 32 × $34.706, netos; total $5.611.559. *"La idea es que esto
 * lea exactamente lo que dice la orden de compra"*, con el precio con IVA
 * redondo, y *"cuadrémonos"*.
 */

const LINEAS = [
  { descripcion: 'MENU ADULTO', cantidad: 78, precio: 46218, con_iva: false },
  { descripcion: 'MENU NIÑOS', cantidad: 32, precio: 34706, con_iva: false },
];

const OC: OrdenAFacturar = {
  id: 7,
  numero: '33000132942',
  fecha: '2026-10-14',
  rut: '65175242-6',
  razon_social: 'Corporación Centro de Formación Técnica Santo Tomás',
  comprador: {
    giro: 'Educación',
    direccion: 'Av. Ejemplo 123',
    comuna: 'San Joaquín',
    ciudad: 'Santiago',
  },
  descripcion: 'MENU ADULTO · MENU NIÑOS',
  lineas: LINEAS,
  neto: 4715596,
  iva: 895963,
  total: 5611559,
  facturado: 0,
  pdf: 'PO_33000132942.pdf',
};

const contexto = (cambios: Partial<ContextoDeLaFactura> = {}) =>
  ({
    evento: {
      id: 'ev-481',
      numero: 481,
      estado: 'aceptada',
      tipoDeEvento: 'Fiesta de navidad',
      desde: '2026-12-12',
      hasta: null,
      personas: 110,
      total: 5611559,
      clientId: 'st',
      cliente: 'Santo Tomás',
    },
    oc: OC,
    razones: [],
    facturadoDelEvento: 0,
    totalDeLasOC: 5611559,
    ...cambios,
  }) as ContextoDeLaFactura;

describe('El precio con IVA redondo de un neto de la OC (§9.37)', () => {
  it('el que da justo ese neto, el más redondo', () => {
    expect(precioConIvaDe(46218)).toBe(55000);
    expect(precioConIvaDe(34706)).toBe(41300);
    expect(precioConIvaDe(12345)).toBe(14690);
    expect(Math.round(precioConIvaDe(12345) / 1.19)).toBe(12345);
  });
});

describe('Las líneas de la factura, como la OC (§9.37)', () => {
  it('toda la OC: sus líneas con su cantidad y el precio con IVA', () => {
    expect(lineasDeLaOC(OC, 5611559)).toEqual([
      {
        descripcion: 'MENU ADULTO',
        descripcion_larga: null,
        cantidad: 78,
        precio: 55000,
      },
      {
        descripcion: 'MENU NIÑOS',
        descripcion_larga: null,
        cantidad: 32,
        precio: 41300,
      },
    ]);
  });

  it('el 50 % parte las cantidades; lo que queda después, también', () => {
    const mitad = lineasDeLaOC(OC, Math.round(5611559 / 2));
    expect(mitad?.map((l) => l.cantidad)).toEqual([39, 16]);
    // Después de la 386 ($2.805.800), quedan $2.805.759.
    const resto = lineasDeLaOC({ ...OC, facturado: 2805800 }, 2805759);
    expect(resto?.map((l) => l.cantidad)).toEqual([39, 16]);
  });

  it('si las cantidades no se parten exactas, o no hay líneas, nulo (va por el monto)', () => {
    expect(lineasDeLaOC(OC, Math.round(5611559 * 0.3))).toBeNull();
    expect(lineasDeLaOC({ ...OC, lineas: null }, 5611559)).toBeNull();
    expect(lineasDeLaOC({ ...OC, lineas: [] }, 5611559)).toBeNull();
  });

  it('con precios que ya traen el IVA, van tal cual', () => {
    const conIva = LINEAS.map((l) => ({ ...l, precio: 55000, con_iva: true }));
    expect(
      lineasDeLaOC({ ...OC, lineas: conIva }, 5611559)?.map((l) => l.precio),
    ).toEqual([55000, 55000]);
  });
});

describe('El cuadre de la que cierra la OC (§9.37)', () => {
  const netas = (cantidades: [number, number]) => [
    {
      descripcion: 'MENU ADULTO',
      cantidad: cantidades[0],
      precio: precioNetoDe(55000),
    },
    {
      descripcion: 'MENU NIÑOS',
      cantidad: cantidades[1],
      precio: precioNetoDe(41300),
    },
  ];

  it('con lo que queda y unos pesos de redondeo: la última línea ajusta y el total calza', () => {
    const r = cuadrarConLoQueQueda(netas([39, 16]), 2805759);
    expect(r?.diferencia).toBe(41);
    const neto = (r?.lineas ?? []).reduce(
      (s, l) => s + Math.round(l.cantidad * l.precio),
      0,
    );
    expect(neto + Math.round(neto * 0.19)).toBe(2805759);
    expect(r?.lineas[0]).toEqual(netas([39, 16])[0]);
  });

  it('si no cierra la OC, o ya calza, no se toca', () => {
    expect(cuadrarConLoQueQueda(netas([39, 16]), 5611559)).toBeNull();
    expect(cuadrarConLoQueQueda(netas([39, 16]), 2805800)).toBeNull();
  });
});

describe('El borrador y la revisión con las líneas de la OC (§9.37)', () => {
  it('BelIA arma la factura línea por línea, como la OC', () => {
    const { pedida, origenes } = armarBorrador(contexto());
    expect(
      pedida.lineas.map((l) => [l.descripcion, l.cantidad, l.precio]),
    ).toEqual([
      ['MENU ADULTO', 78, 55000],
      ['MENU NIÑOS', 32, 41300],
    ]);
    expect(origenes.detalle).toBe('orden_de_compra');
  });

  it('la factura de toda la OC cuadra con su total y lo dice', () => {
    const { pedida } = armarBorrador(contexto());
    const r = revisarDte(pedida, contexto(), 386, '2026-11-08');
    expect(r.montos?.total).toBe(5611559);
    expect(r.avisos.join(' ')).toContain('Cuadra con lo que le queda a la OC');
  });

  it('el 50 %: la mitad de las cantidades, con sus pesos de redondeo y sin cuadrar', () => {
    const { pedida } = armarBorrador(contexto({ porcentaje: 50 }));
    expect(pedida.lineas.map((l) => l.cantidad)).toEqual([39, 16]);
    const r = revisarDte(
      pedida,
      contexto({ porcentaje: 50 }),
      386,
      '2026-11-08',
    );
    expect(r.montos?.total).toBe(2805800);
  });
});

describe('BelIA lee las líneas de la OC (§9.37)', () => {
  const LEIDA = {
    es_orden_de_compra: true,
    numero: '33000132942',
    fecha: '2026-10-14',
    rut_comprador: '65.175.242-6',
    razon_social_comprador:
      'Corporación Centro de Formación Técnica Santo Tomás',
    giro_comprador: '',
    direccion_comprador: '',
    comuna_comprador: '',
    ciudad_comprador: '',
    detalle: 'MENU ADULTO · MENU NIÑOS',
    lineas: [
      { descripcion: 'MENU ADULTO', cantidad: 78, precio_unitario: 46218 },
      { descripcion: 'MENU NIÑOS', cantidad: 32, precio_unitario: 34706 },
    ],
    precios_con_iva: false,
    neto: 4715596,
    iva: 895963,
    total: 5611559,
    otras_referencias: [],
  };
  const empresa = { nombre: 'Valle del Sol Quillón SpA', rut: '77701305-K' };

  it('las que cuadran con el neto de la OC, con su cantidad y su precio', () => {
    expect(propuestaDeLaLectura(LEIDA, empresa)?.propuesta.lineas).toEqual(
      LINEAS,
    );
  });

  it('si no suman el neto, no se usan y se avisa', () => {
    const r = propuestaDeLaLectura(
      {
        ...LEIDA,
        lineas: [
          { descripcion: 'MENU ADULTO', cantidad: 78, precio_unitario: 46218 },
        ],
      },
      empresa,
    );
    expect(r?.propuesta.lineas).toBeNull();
    expect(r?.avisos.join(' ')).toContain(
      'Las líneas de la OC no suman su monto',
    );
  });
});
