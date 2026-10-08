import { describe, expect, it } from "vitest";
import type { PaymentTransaction } from "../../services/paymentTransactions.service";
import { pagoEntero, piezasDelPago, preguntaAlBorrar } from "./pagoRepartido";

const reg = (id: number, amount: number, pago_grupo?: string) =>
  ({ id, amount, pago_grupo }) as PaymentTransaction;

// Linde (lab, 07-10-2026): $1.000.000 quedó en la cuota 1 ($950.250) y
// en la 2 ($49.750); en la 2 hay además otro pago de $300.000.
const a = reg(1, 950250, "g1");
const b = reg(2, 49750, "g1");
const otro = reg(3, 300000, "g2");
const cuotas = [{ transactions: [a] }, { transactions: [b, otro] }];

describe("un pago repartido en varias cuotas es uno solo", () => {
  it("junta las piezas del mismo pago, en cualquier cuota", () => {
    expect(piezasDelPago(cuotas, b).map((p) => p.id)).toEqual([1, 2]);
    expect(piezasDelPago(cuotas, otro).map((p) => p.id)).toEqual([3]);
  });

  it("al rectificar se abre el pago entero", () => {
    expect(pagoEntero(cuotas, b).amount).toBe(1000000);
    expect(pagoEntero(cuotas, otro).amount).toBe(300000);
  });

  it("antes de borrar avisa que está repartido y que se borra entero", () => {
    expect(preguntaAlBorrar(cuotas, a)).toBe(
      "¿Eliminar este pago de $1.000.000? Está repartido en 2 cuotas y se elimina entero.",
    );
    expect(preguntaAlBorrar(cuotas, otro)).toBe("¿Eliminar este pago?");
  });

  it("un registro viejo sin grupo es su propio pago", () => {
    const viejo = reg(9, 500);
    expect(piezasDelPago([{ transactions: [viejo] }], viejo)).toEqual([viejo]);
  });
});
