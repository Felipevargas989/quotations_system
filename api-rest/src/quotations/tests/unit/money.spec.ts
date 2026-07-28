// Pruebas de la cuenta del dinero en el backend (Fase 1, 27-07-2026).
// La referencia es computeTotals del cotizador: misma fórmula, mismos
// redondeos. Cada caso replica un guardado real del frontend.
import { computeMoney, hasMoneyToVerify, verifyMoney } from '../../utils/money';

// Caja de variables como la arma buildItemsSnapshot
const box = (
  people: number,
  precios: [number, number][], // [precio, cantidad]
  audience: string = 'adultos',
) => ({
  audience,
  people,
  items: precios.map(([precio, quantity], i) => ({
    codigo: `S${i}`,
    nombre: `Servicio ${i}`,
    precio,
    categoria: 'Banquetería',
    quantity,
  })),
});

const fijo = (precio: number, quantity = 1) => ({
  codigo: 'F1',
  nombre: 'Fijo',
  precio,
  categoria: 'Producción',
  quantity,
});

describe('computeMoney', () => {
  it('sin ítems: todo en cero', () => {
    const t = computeMoney({ items: {}, people_count: 50 });
    expect(t.totalAmount).toBe(0);
    expect(t.subtotalAmount).toBe(0);
  });

  it('variables por caja × personas, más fijos', () => {
    // 80 adultos a $25.000 + arriendo fijo $300.000
    const t = computeMoney({
      items: {
        variable_services: [box(80, [[25000, 1]])],
        fixed_services: [fijo(300000)],
      },
      people_count: 80,
      children_count: 0,
    });
    expect(t.variableGrandTotal).toBe(2000000);
    expect(t.fixedTotal).toBe(300000);
    expect(t.subtotalAmount).toBe(2300000);
    expect(t.valuePerPerson).toBe(25000);
    expect(t.totalAmount).toBe(2300000);
  });

  it('niños: cada caja multiplica por SU audiencia', () => {
    // 60 adultos a $30.000 y 20 niños a $15.000 (80 personas en total)
    const t = computeMoney({
      items: {
        variable_services: [
          box(60, [[30000, 1]]),
          box(20, [[15000, 1]], 'ninos'),
        ],
      },
      people_count: 80,
      children_count: 20,
    });
    expect(t.variableGrandTotal).toBe(1800000 + 300000);
    // value_per_person: solo cajas de adultos que cubren a TODOS los adultos
    expect(t.valuePerPerson).toBe(30000);
  });

  it('descuento por porcentaje, con tope 100', () => {
    const items = { variable_services: [box(100, [[10000, 1]])] };
    const d10 = computeMoney({
      items,
      people_count: 100,
      discount_percentage: 10,
    });
    expect(d10.discountAmount).toBe(100000);
    expect(d10.totalAmount).toBe(900000);

    const d150 = computeMoney({
      items,
      people_count: 100,
      discount_percentage: 150, // se topa en 100
    });
    expect(d150.totalAmount).toBe(0);
  });

  it('descuento por monto, con tope en el subtotal', () => {
    const items = { variable_services: [box(10, [[10000, 1]])] };
    const d = computeMoney({
      items,
      people_count: 10,
      discount_amount: 30000,
    });
    expect(d.discountAmount).toBe(30000);
    expect(d.totalAmount).toBe(70000);

    const excesivo = computeMoney({
      items,
      people_count: 10,
      discount_amount: 999999, // más grande que la cotización
    });
    expect(excesivo.discountAmount).toBe(100000);
    expect(excesivo.totalAmount).toBe(0);
  });

  it('propina: % sobre las variables, sin IVA, después del descuento', () => {
    // variables $1.000.000, fijos $500.000, 10% descuento, 10% propina
    const t = computeMoney({
      items: {
        variable_services: [box(50, [[20000, 1]])],
        fixed_services: [fijo(500000)],
      },
      people_count: 50,
      discount_percentage: 10,
      tip_percentage: 10,
    });
    // propina = 10% de $1.000.000 (solo variables), NO del subtotal
    expect(t.tipAmount).toBe(100000);
    // total = (1.500.000 − 150.000) + 100.000
    expect(t.totalAmount).toBe(1450000);
  });

  it('propina null = sin propina, aunque haya variables', () => {
    const t = computeMoney({
      items: { variable_services: [box(50, [[20000, 1]])] },
      people_count: 50,
      tip_percentage: null,
    });
    expect(t.tipAmount).toBe(0);
  });

  it('caja vieja sin personas ni audiencia: total del evento (regla pre-2.0)', () => {
    const t = computeMoney({
      items: {
        variable_services: [
          { items: [{ precio: 10000, quantity: 1 }] }, // sin people/audience
        ],
      },
      people_count: 40,
      children_count: 0,
    });
    expect(t.variableGrandTotal).toBe(400000);
    expect(t.valuePerPerson).toBe(10000);
  });

  it('cantidad ausente vale 1 (regla de Post-Venta)', () => {
    const t = computeMoney({
      items: { fixed_services: [{ precio: 250000 }] },
      people_count: 10,
    });
    expect(t.fixedTotal).toBe(250000);
  });
});

describe('verifyMoney', () => {
  const payloadHonesto = () => {
    const items = {
      variable_services: [box(80, [[25000, 1]])],
      fixed_services: [fijo(300000)],
    };
    return {
      declared: {
        fixed_value: 300000,
        value_per_person: 25000,
        subtotal_amount: 2300000,
        discount_percentage: 0,
        discount_amount: 0,
        tip_percentage: null,
        tip_amount: 0,
        total_amount: 2300000,
      },
      input: { items, people_count: 80, children_count: 0 },
    };
  };

  it('un guardado del cotizador pasa sin observaciones', () => {
    const { declared, input } = payloadHonesto();
    expect(verifyMoney(declared, input)).toEqual([]);
  });

  it('un total adulterado se detecta', () => {
    const { declared, input } = payloadHonesto();
    declared.total_amount = 1000; // "total: mil pesos"
    const errores = verifyMoney(declared, input);
    expect(errores).toHaveLength(1);
    expect(errores[0].campo).toBe('total_amount');
    expect(errores[0].calculado).toBe(2300000);
  });

  it('un descuento inventado (sin cambiar el total) se detecta', () => {
    const { declared, input } = payloadHonesto();
    declared.discount_amount = 500000;
    input.discount_amount = 500000 as never;
    const errores = verifyMoney(declared, input);
    expect(errores.map((e) => e.campo)).toContain('total_amount');
  });

  it('en modo % el monto del descuento viaja en 0 (regla del cotizador)', () => {
    const items = { variable_services: [box(100, [[10000, 1]])] };
    const errores = verifyMoney(
      {
        fixed_value: 0,
        value_per_person: 10000,
        subtotal_amount: 1000000,
        discount_percentage: 10,
        discount_amount: 0,
        tip_percentage: null,
        tip_amount: 0,
        total_amount: 900000,
      },
      { items, people_count: 100, children_count: 0, discount_percentage: 10 },
    );
    expect(errores).toEqual([]);
  });

  it('propina con monto que no sale de su porcentaje se detecta', () => {
    const items = { variable_services: [box(50, [[20000, 1]])] };
    const errores = verifyMoney(
      {
        fixed_value: 0,
        value_per_person: 20000,
        subtotal_amount: 1000000,
        discount_percentage: 0,
        discount_amount: 0,
        tip_percentage: 10,
        tip_amount: 999999, // no es el 10% de $1.000.000
        total_amount: 1999999,
      },
      { items, people_count: 50, children_count: 0, tip_percentage: 10 },
    );
    expect(errores.map((e) => e.campo)).toContain('tip_amount');
  });
});

describe('hasMoneyToVerify', () => {
  it('una solicitud sin ítems y sin montos pasa de largo', () => {
    expect(
      hasMoneyToVerify(
        { total_amount: 0, subtotal_amount: 0 },
        { fixed_services: [], variable_services: [] },
      ),
    ).toBe(false);
  });

  it('un total sin ítems SÍ se verifica (y no va a calzar)', () => {
    expect(hasMoneyToVerify({ total_amount: 5000000 }, undefined)).toBe(true);
    expect(
      verifyMoney(
        { total_amount: 5000000 },
        { items: undefined, people_count: 10 },
      ).map((e) => e.campo),
    ).toContain('total_amount');
  });
});

describe('fotos viejas (anteriores al 24-07)', () => {
  it('fijo "por persona" guardado sin resolver: precio 0 + tarifa × personas', () => {
    // Caso real: cotización #52, 50 personas, tarifa $3.000 → $150.000
    const t = computeMoney({
      items: {
        fixed_services: [
          {
            precio: 0,
            quantity: 1,
            tipo_calculo: 'fijo_variable',
            precio_por_persona: 3000,
          },
        ],
      },
      people_count: 50,
    });
    expect(t.fixedTotal).toBe(150000);
  });

  it('foto actual con precio ya resuelto NO se resuelve dos veces', () => {
    const t = computeMoney({
      items: {
        fixed_services: [
          {
            precio: 150000, // ya resuelto por el cotizador
            quantity: 1,
            tipo_calculo: 'fijo_variable',
            precio_por_persona: 3000,
          },
        ],
      },
      people_count: 50,
    });
    expect(t.fixedTotal).toBe(150000);
  });
});
