import {
  costoPorUnidad,
  instruccionesDeLaCompra,
  normalizar,
  propuestaDeLaCompra,
  proveedorDe,
  variacion,
  type EquivalenteParaLeer,
  type InsumoParaLeer,
} from '../compras/leer-compra';

// Doc 25 (23-11-2026): la compra que lee la IA.

const insumos: InsumoParaLeer[] = [
  { id: 1, name: 'Carne a la olla', unit_family: 'masa', price: 10303 },
  { id: 2, name: 'Aceite maravilla', unit_family: 'volumen', price: 2100 },
  { id: 3, name: 'Lomo vetado nacional', unit_family: 'masa', price: 15458 },
];
const equivalentes: EquivalenteParaLeer[] = [
  {
    supply_id: 1,
    nombre: 'Guachalomo',
    nombre_normal: 'guachalomo',
    tipo: 'corte',
    supplier_id: null,
  },
  {
    supply_id: 2,
    nombre: 'ACEITE PEDRITO 5L',
    nombre_normal: normalizar('ACEITE PEDRITO 5L'),
    tipo: 'texto',
    supplier_id: 7,
  },
];

describe('propuestaDeLaCompra', () => {
  it('no propone nada si no es una compra', () => {
    expect(
      propuestaDeLaCompra({ es_compra: false, lineas: [] }, insumos, [], null),
    ).toBeNull();
  });

  it('calcula el costo por unidad base y guarda el de antes', () => {
    const r = propuestaDeLaCompra(
      {
        es_compra: true,
        tipo_documento: 'factura',
        totales_netos: true,
        numero: '4521',
        fecha: '2026-11-20',
        lineas: [
          {
            texto: 'GUACHALOMO VAC',
            insumo_id: 1,
            equivalente: 'Guachalomo',
            cantidad_base: 12.4,
            total: 135036,
          },
        ],
      },
      insumos,
      equivalentes,
      null,
    )!;
    expect(r.con_iva).toBe(false);
    expect(r.lineas[0]).toMatchObject({
      supply_id: 1,
      equivalente: 'Guachalomo',
      costo_base: 10890,
      costo_antes: 10303,
    });
  });

  it('descarta un insumo que no es de la empresa', () => {
    const r = propuestaDeLaCompra(
      {
        es_compra: true,
        tipo_documento: 'boleta',
        totales_netos: false,
        lineas: [{ texto: 'X', insumo_id: 999, cantidad_base: 1, total: 10 }],
      },
      insumos,
      [],
      null,
    )!;
    expect(r.lineas[0].supply_id).toBeNull();
    expect(r.lineas[0].costo_base).toBeNull();
    expect(r.con_iva).toBe(true);
  });

  it('lo aprendido del mismo proveedor manda sobre la IA', () => {
    const r = propuestaDeLaCompra(
      {
        es_compra: true,
        tipo_documento: 'factura',
        totales_netos: true,
        lineas: [
          {
            texto: 'Aceite Pedrito 5L',
            insumo_id: 3,
            cantidad_base: 10,
            total: 20500,
          },
        ],
      },
      insumos,
      equivalentes,
      7,
    )!;
    expect(r.lineas[0].supply_id).toBe(2);
    expect(r.lineas[0].costo_base).toBe(2050);
  });

  it('lo aprendido de OTRO proveedor no cuenta', () => {
    const r = propuestaDeLaCompra(
      {
        es_compra: true,
        tipo_documento: 'factura',
        totales_netos: true,
        lineas: [{ texto: 'ACEITE PEDRITO 5L', cantidad_base: 10, total: 1 }],
      },
      insumos,
      equivalentes,
      8,
    )!;
    expect(r.lineas[0].supply_id).toBeNull();
  });

  it('cuando duda: guarda los posibles (solo de la empresa) y el corte leído', () => {
    const r = propuestaDeLaCompra(
      {
        es_compra: true,
        tipo_documento: 'factura',
        totales_netos: true,
        lineas: [
          {
            texto: 'PUNTA PALETA KG',
            equivalente: 'Punta paleta',
            posibles: [1, 999, 3, 1, 2],
            cantidad_base: 5,
            total: 50000,
          },
        ],
      },
      insumos,
      [],
      null,
    )!;
    // Sugiere el más probable, con los posibles a la vista por confirmar.
    expect(r.lineas[0]).toMatchObject({
      supply_id: 1,
      equivalente: 'Punta paleta',
      posibles: [1, 3, 2],
      costo_base: 10000,
    });
  });

  it('una guía sin montos no propone costo', () => {
    const r = propuestaDeLaCompra(
      {
        es_compra: true,
        tipo_documento: 'guia',
        totales_netos: true,
        lineas: [{ texto: 'Lomo vetado', insumo_id: 3, cantidad_base: 6 }],
      },
      insumos,
      [],
      null,
    )!;
    expect(r.lineas[0].costo_base).toBeNull();
    expect(r.lineas[0].cantidad_base).toBe(6);
  });
});

describe('ayudas de la compra', () => {
  it('el catálogo de las instrucciones lleva cortes y marcas, no lo aprendido', () => {
    const t = instruccionesDeLaCompra('Valle del Sol', insumos, equivalentes);
    expect(t).toContain(
      '1 | Carne a la olla | kg | equivale: corte Guachalomo',
    );
    expect(t.split('Catálogo de insumos:')[1]).not.toContain('PEDRITO');
  });

  it('el proveedor por nombre normalizado o contenido', () => {
    const p = [
      { id: 1, name: 'Carnes Sur' },
      { id: 2, name: 'Distribuidora Ñuble' },
    ];
    expect(proveedorDe('CARNES SUR SPA', p)).toBe(1);
    expect(proveedorDe('distribuidora nuble', p)).toBe(2);
    expect(proveedorDe('Otro', p)).toBeNull();
  });

  it('costo y variación', () => {
    expect(costoPorUnidad(20500, 10)).toBe(2050);
    expect(costoPorUnidad(null, 10)).toBeNull();
    expect(variacion(15458, 19900)).toBe(29);
    expect(variacion(0, 1)).toBeNull();
  });
});
