import { describe, expect, it } from "vitest";
import { saleWithoutTip, tipAmountOf } from "./quotationMoney";

// Fase 2 Bloque C: la regla de la propina, vigilada también en el
// frontend (el backend ya la vigila en money.spec.ts).
describe("tipAmountOf — el monto guardado manda", () => {
  it("con monto guardado, ese es el número (no se recalcula)", () => {
    expect(
      tipAmountOf({
        tip_amount: 50000,
        tip_percentage: 10,
        subtotal_amount: 900000,
        fixed_value: 100000,
      }),
    ).toBe(50000);
  });

  it("sin monto guardado pero con %, reconstruye sobre los variables", () => {
    // variables = subtotal 900.000 − fijos 100.000 = 800.000; 10% = 80.000
    expect(
      tipAmountOf({
        tip_amount: null,
        tip_percentage: 10,
        subtotal_amount: 900000,
        fixed_value: 100000,
      }),
    ).toBe(80000);
  });

  it("sin propina no hay nada que reconstruir", () => {
    expect(tipAmountOf({ tip_amount: 0, tip_percentage: 0 })).toBe(0);
    expect(tipAmountOf(null)).toBe(0);
    expect(tipAmountOf(undefined)).toBe(0);
  });

  it("el porcentaje se topa en 100 (mismo tope del cotizador)", () => {
    expect(
      tipAmountOf({
        tip_percentage: 250,
        subtotal_amount: 100000,
        fixed_value: 0,
      }),
    ).toBe(100000);
  });
});

describe("saleWithoutTip — la base de ventas y margen", () => {
  it("resta la propina del total", () => {
    expect(
      tipAmountOf({ tip_amount: 50000 }) &&
        saleWithoutTip({ total_amount: 1050000, tip_amount: 50000 }),
    ).toBe(1000000);
  });

  it("sin propina, la venta es el total", () => {
    expect(saleWithoutTip({ total_amount: 500000 })).toBe(500000);
  });
});
