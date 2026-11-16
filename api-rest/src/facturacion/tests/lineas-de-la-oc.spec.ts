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
  lineasDelSaldo,
  lineasFacturadasDeLasOC,
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
  descripcion:
    'MENU ADULTO · MENU NIÑOS, Fiesta de Navidad Santo Tomás 2026, CFT Chillán, 12-12-2026',
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
    // La descripción larga de la OC no se usa: no se avisa que va cortada.
    expect(r.avisos.join(' ')).not.toContain('va cortada');
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

/**
 * EL SALDO DE LA OC CON SUS LÍNEAS (doc 19 §9.52). El caso real: la OC N°
 * 16.617 de Ecofor (cotización N° 616), tres líneas netas; la factura 391
 * fue por 190 de 379, 97 de 194 y 3 de 6 (neto $8.351.500, total
 * $9.938.285). Lo que queda va en las mismas tres líneas.
 */
describe('El saldo de la OC, línea por línea (§9.52)', () => {
  const PENSION = 'SERVICIO PENSIÓN COMPLETA TURNO DÍA';
  const ALMUERZO = 'SERVICIO ALMUERZO TURNO NOCHE';
  const LAVANDERIA = 'SERVICIO DE LAVANDERIA';
  const LINEAS_ECOFOR = [
    { descripcion: PENSION, cantidad: 379, precio: 40000, con_iva: false },
    { descripcion: ALMUERZO, cantidad: 194, precio: 7500, con_iva: false },
    { descripcion: LAVANDERIA, cantidad: 6, precio: 8000, con_iva: false },
  ];
  // Como quedó guardado el detalle de la 391: en neto.
  const FACTURA_391 = [
    {
      descripcion: PENSION,
      descripcionLarga: 'Se facturan 190 de 379',
      cantidad: 190,
      precio: 40000,
    },
    {
      descripcion: ALMUERZO,
      descripcionLarga: 'Se facturan 97 de 194',
      cantidad: 97,
      precio: 7500,
    },
    {
      descripcion: LAVANDERIA,
      descripcionLarga: 'Se facturan 3 de 6',
      cantidad: 3,
      precio: 8000,
    },
  ];
  const ECOFOR: OrdenAFacturar = {
    ...OC,
    id: 13,
    numero: '16617',
    descripcion: null,
    lineas: LINEAS_ECOFOR,
    neto: 16663000,
    iva: 3165970,
    total: 19828970,
    facturado: 9938285,
    lineasFacturadas: [FACTURA_391],
    pdf: null,
  };
  const ctxEcofor = (oc: Partial<OrdenAFacturar> = {}) =>
    contexto({
      evento: {
        ...contexto().evento!,
        numero: 616,
        total: 19054055,
        personas: null,
      },
      oc: { ...ECOFOR, ...oc },
      facturadoDelEvento: 9938285,
      totalDeLasOC: 19828970,
    });

  it('Ecofor: 189 de 379, 97 de 194 y 3 de 6, por los $9.890.685 que le quedan a la OC', () => {
    const { pedida, origenes } = armarBorrador(ctxEcofor());
    expect(
      pedida.lineas.map((l) => [
        l.descripcion,
        l.descripcion_larga,
        l.cantidad,
        l.precio,
      ]),
    ).toEqual([
      [PENSION, 'Se facturan 189 de 379', 189, 47600],
      [ALMUERZO, 'Se facturan 97 de 194', 97, 8925],
      [LAVANDERIA, 'Se facturan 3 de 6', 3, 9520],
    ]);
    expect(origenes.detalle).toBe('orden_de_compra');
    const r = revisarDte(pedida, ctxEcofor(), 392, '2026-11-16');
    expect(r.montos).toMatchObject({
      neto: 8311500,
      iva: 1579185,
      total: 9890685,
    });
    expect(r.problemas).toEqual([]);
    expect(r.lineas.map((l) => l.descripcionLarga)).toEqual([
      'Se facturan 189 de 379',
      'Se facturan 97 de 194',
      'Se facturan 3 de 6',
    ]);
    // E1 no cambia: va por la OC y avisa lo que suma la cotización.
    expect(r.avisos.join(' ')).toContain('La cotización suma $19.054.055');
  });

  it('si una línea no calza (otra descripción u otro precio), el saldo va en una línea por el monto', () => {
    for (const cambio of [
      { descripcion: 'OTRA COSA' },
      { precio: 41000 },
      { descuento: 10 },
    ]) {
      const facturada = [
        { ...FACTURA_391[0], ...cambio },
        ...FACTURA_391.slice(1),
      ];
      const { pedida } = armarBorrador(
        ctxEcofor({ lineasFacturadas: [facturada] }),
      );
      expect(pedida.lineas).toHaveLength(1);
      expect(pedida.lineas[0]).toMatchObject({ cantidad: 1, precio: 9890685 });
    }
  });

  it('por posición: la misma factura con sus líneas en otro orden no calza', () => {
    const otroOrden = [FACTURA_391[1], FACTURA_391[0], FACTURA_391[2]];
    expect(lineasDelSaldo(ECOFOR, [otroOrden], 9890685)).toBeNull();
  });

  it('si una línea queda en cero, o las líneas no suman lo que queda, por el monto', () => {
    const lavanderiaEntera = [
      FACTURA_391[0],
      FACTURA_391[1],
      { ...FACTURA_391[2], cantidad: 6 },
    ];
    expect(lineasDelSaldo(ECOFOR, [lavanderiaEntera], 9862125)).toBeNull();
    // La OC dice que le quedan $500.000 menos de lo que suman sus líneas.
    expect(lineasDelSaldo(ECOFOR, [FACTURA_391], 9390685)).toBeNull();
  });

  it('una parte (el 30 %) después de la primera factura sigue como antes, no línea por línea', () => {
    const { pedida } = armarBorrador({ ...ctxEcofor(), porcentaje: 30 });
    expect(pedida.lineas.every((l) => l.descripcion_larga == null)).toBe(true);
  });

  it('sin facturas antes, igual que hoy: toda la OC sin «Se facturan»', () => {
    const { pedida } = armarBorrador(
      ctxEcofor({ facturado: 0, lineasFacturadas: [] }),
    );
    expect(pedida.lineas.map((l) => [l.cantidad, l.descripcion_larga])).toEqual(
      [
        [379, null],
        [194, null],
        [6, null],
      ],
    );
  });

  describe('lo facturado por línea, con las notas de crédito (cadena)', () => {
    const fila = (id: number, cambios: Record<string, unknown> = {}) => ({
      id,
      tipo: 33,
      folio: 390 + id,
      estado: 'emitido',
      total: 9938285,
      fecha_emision: '2026-11-13',
      modifica_id: null,
      codigo_referencia: null,
      orden_de_compra_id: 13,
      detalle: FACTURA_391,
      ...cambios,
    });
    const nota = (
      id: number,
      modifica: number,
      codigo: number,
      tipo = 61,
      total = 9938285,
    ) => ({
      ...fila(id, {
        tipo,
        total,
        modifica_id: modifica,
        codigo_referencia: codigo,
        detalle: [],
      }),
    });

    it('una factura vigente cuenta su detalle; una anulada por su NC, no', () => {
      const porOC = lineasFacturadasDeLasOC([fila(1), fila(2), nota(3, 2, 1)]);
      expect(porOC.get(13)).toEqual([FACTURA_391]);
    });

    it('con la NC anulada por una ND, la factura vuelve a contar', () => {
      const porOC = lineasFacturadasDeLasOC([
        fila(1),
        fila(2),
        nota(3, 2, 1),
        nota(4, 3, 1, 56),
      ]);
      expect(porOC.get(13)).toEqual([FACTURA_391, FACTURA_391]);
    });

    it('una factura rebajada por monto no se sabe por línea: el saldo va por el monto', () => {
      const porOC = lineasFacturadasDeLasOC([
        fila(1),
        nota(2, 1, 3, 61, 1000000),
      ]);
      expect(porOC.get(13)).toBeNull();
      const { pedida } = armarBorrador(
        ctxEcofor({ facturado: 8938285, lineasFacturadas: porOC.get(13) }),
      );
      expect(pedida.lineas).toHaveLength(1);
      expect(pedida.lineas[0].precio).toBe(19828970 - 8938285);
    });

    it('lo rechazado no cuenta', () => {
      expect(
        lineasFacturadasDeLasOC([fila(1, { estado: 'rechazado' })]).get(13),
      ).toBeUndefined();
    });
  });
});
