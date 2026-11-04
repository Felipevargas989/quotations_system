import {
  buildConsolidationContext,
  canonicalServiceName,
  consolidateEvent,
  grossQty,
  mapFixedCosts,
  mapNameIds,
  newAccumulator,
  servicesSignature,
  toBaseQty,
  type LineaDeReceta,
} from '../utils/consolidacion';

// LA CUENTA DE LO QUE LLEVA CADA EVENTO (03-11-2026). Hasta hoy no tenía
// ninguna prueba y la usan siete pantallas (mapa 06, riesgo 1); desde hoy
// también BelIA. Estas pruebas fijan lo que ya hacía antes de moverla al
// motor: si una falla, cambió la cifra de Compras.

const receta = (
  r: Partial<LineaDeReceta> &
    Pick<LineaDeReceta, 'service_type' | 'service_id'>,
): LineaDeReceta => ({
  item_kind: 'insumo',
  supply_id: null,
  furniture_id: null,
  qty_per_person: 1,
  unit: 'u',
  ...r,
});

const carne = { id: 1, name: 'Carne mechada', price: 10_000, waste_pct: 20 };
const pan = { id: 2, name: 'Pan', price: 100, waste_pct: 0 };
const silla = { id: 10, name: 'Silla', preassembled: false };
const copa = { id: 11, name: 'Copa de cóctel', preassembled: true };

const contexto = () =>
  buildConsolidationContext(
    [
      // variable 100: 200 g de carne y 2 panes por persona
      receta({
        service_type: 'variable',
        service_id: 100,
        supply_id: 1,
        qty_per_person: 200,
        unit: 'gr',
      }),
      receta({
        service_type: 'variable',
        service_id: 100,
        supply_id: 2,
        qty_per_person: 2,
      }),
      // variable 101: una silla y una copa por persona
      receta({
        service_type: 'variable',
        service_id: 101,
        item_kind: 'mobiliario',
        furniture_id: 10,
      }),
      receta({
        service_type: 'variable',
        service_id: 101,
        item_kind: 'mobiliario',
        furniture_id: 11,
      }),
      // variable 102: lo mismo, en otro servicio
      receta({
        service_type: 'variable',
        service_id: 102,
        item_kind: 'mobiliario',
        furniture_id: 10,
      }),
      receta({
        service_type: 'variable',
        service_id: 102,
        item_kind: 'mobiliario',
        furniture_id: 11,
      }),
    ],
    [carne, pan],
    [silla, copa],
    { variable: { 'pollo asado 1 pp': 100 }, fixed: {} },
    { 5: { cost_fixed: 10_000, cost_per_person: 500 } },
  );

describe('La cuenta de lo que lleva cada evento', () => {
  it('la cantidad va en neto y la merma solo en el costo (regla del 22-07)', () => {
    const acc = newAccumulator();
    const r = consolidateEvent(
      {
        variable_services: [
          {
            people: 8,
            items: [{ codigo: '100', nombre: 'Lomo', quantity: 1 }],
          },
        ],
      },
      10,
      contexto(),
      acc,
    );
    // 200 g × 8 personas = 1,6 kg netos; el costo con 20 % de merma
    // es 1,6 / 0,8 × $10.000 = $20.000, más 16 panes a $100.
    expect(r.supplyUse.get(1)).toBeCloseTo(1.6);
    expect(r.supplyUse.get(2)).toBe(16);
    expect(r.costoInsumos).toBeCloseTo(20_000 + 1_600);
    expect(acc.supplyTotals.get(1)?.totalBase).toBeCloseTo(1.6);
    expect(acc.supplyTotals.get(1)?.costTotal).toBeCloseTo(20_000);
    expect(acc.supplyTotals.get(1)?.services).toEqual(['Lomo']);
  });

  it('una casilla sin personas usa las del evento, y la cantidad multiplica', () => {
    const r = consolidateEvent(
      {
        variable_services: [
          { items: [{ codigo: '100', nombre: 'Lomo', quantity: 2 }] },
        ],
      },
      10,
      contexto(),
      newAccumulator(),
    );
    expect(r.supplyUse.get(1)).toBeCloseTo(4); // 0,2 × 10 × 2
  });

  it('reconoce la receta por el nombre canónico cuando el código no es un id', () => {
    const r = consolidateEvent(
      {
        variable_services: [
          {
            people: 5,
            items: [{ codigo: 'P001', nombre: '02 - Pollo Ásado 1pp' }],
          },
        ],
      },
      5,
      contexto(),
      newAccumulator(),
    );
    expect(r.supplyUse.get(1)).toBeCloseTo(1);
  });

  it('avisa «sin receta» solo en los variables', () => {
    const acc = newAccumulator();
    consolidateEvent(
      {
        variable_services: [
          { people: 5, items: [{ codigo: '999', nombre: 'Torta' }] },
        ],
        fixed_services: [{ codigo: '998', nombre: 'Salón' }],
      },
      5,
      contexto(),
      acc,
    );
    expect(acc.noRecipe).toEqual(['Torta']);
  });

  it('el costo de un fijo es fijo + por persona × personas, por la cantidad', () => {
    const r = consolidateEvent(
      { fixed_services: [{ codigo: '5', nombre: 'Barra', quantity: 2 }] },
      10,
      contexto(),
      newAccumulator(),
    );
    expect(r.costoFijos).toBe((10_000 + 500 * 10) * 2);
    expect(r.fixedServices).toEqual([{ id: 5, nombre: 'Barra', qty: 2 }]);
  });

  it('el mobiliario que se lava cuenta el máximo; el que se prepara antes, la suma', () => {
    const acc = newAccumulator();
    const r = consolidateEvent(
      {
        variable_services: [
          { people: 10, items: [{ codigo: '101', nombre: 'Almuerzo' }] },
          { people: 8, items: [{ codigo: '102', nombre: 'Cena' }] },
        ],
      },
      10,
      contexto(),
      acc,
    );
    expect(r.furnPeak.get(10)).toEqual({
      total: 10,
      peakService: 'Almuerzo',
      preassembled: false,
    });
    expect(r.furnPeak.get(11)).toEqual({
      total: 18,
      peakService: '',
      preassembled: true,
    });
    expect(acc.furnTotals.get(10)?.total).toBe(10);
  });

  it('el acumulador suma varios eventos', () => {
    const ctx = contexto();
    const acc = newAccumulator();
    const evento = {
      variable_services: [
        { people: 10, items: [{ codigo: '100', nombre: 'Lomo' }] },
      ],
    };
    consolidateEvent(evento, 10, ctx, acc);
    consolidateEvent(evento, 10, ctx, acc);
    expect(acc.supplyTotals.get(1)?.totalBase).toBeCloseTo(4);
    expect(acc.supplyTotals.get(2)?.totalBase).toBe(40);
  });

  it('la firma de los servicios va ordenada, con la cantidad 1 por defecto', () => {
    expect(
      servicesSignature({
        variable_services: [{ items: [{ codigo: '1', nombre: 'Postre' }] }],
        fixed_services: [{ codigo: '2', nombre: 'Barra', quantity: 3 }],
      }),
    ).toEqual([
      { nombre: 'Barra', quantity: 3 },
      { nombre: 'Postre', quantity: 1 },
    ]);
  });

  it('unidades base y merma', () => {
    expect(toBaseQty(250, 'gr')).toBe(0.25);
    expect(toBaseQty(500, 'ml')).toBe(0.5);
    expect(toBaseQty(2, 'kg')).toBe(2);
    expect(grossQty(8, { waste_pct: 20 })).toBe(10);
    expect(grossQty(8, { waste_pct: 0 })).toBe(8);
    expect(grossQty(8, { waste_pct: 100 })).toBe(8);
  });

  it('el nombre canónico: sin tildes, sin prefijo y «1pp» = «1 pp»', () => {
    expect(canonicalServiceName('02 - Pollo  Ásado 1pp ')).toBe(
      'pollo asado 1 pp',
    );
  });

  it('de lo que entrega el motor a lo que lee la cuenta', () => {
    expect(
      mapNameIds({
        variable: [
          { id: 3, name: 'Té', no_cost: true },
          { id: 4, name: 'Café' },
        ],
        fixed: [{ id: 9, name: 'Salón', no_cost: true }],
      }),
    ).toEqual({
      variable: { te: 3, cafe: 4 },
      fixed: { salon: 9 },
      sinCostoVariable: ['te'],
      sinCostoFijoIds: [9],
    });
    expect(
      mapFixedCosts([{ id: 9, cost_fixed: 1, cost_per_person: null }]),
    ).toEqual({ 9: { cost_fixed: 1, cost_per_person: null } });
  });
});
