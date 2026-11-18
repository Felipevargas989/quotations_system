import { describe, it, expect } from "vitest";
import { armarFilas } from "./filasDePostVenta";
import type { PaymentWithTransactions } from "../../services/paymentTransactions.service";

/**
 * LA LISTA DE POST-VENTA (Felipe, 28-10-2026: "los eventos no deberían
 * desaparecer"). La 703 quedó aceptada sin cuotas y no aparecía: las filas
 * salían solo de las cuotas.
 */
const cotizacion = (id: string, n: number, estado: string, total: number) => ({
  id,
  quotation_number: n,
  quotation_status: estado,
  total_amount: total,
  event_date: "2026-12-09T00:00:00+00:00",
  event_end_date: null,
  has_contract: false,
  contact_name: null,
  mandante: { portal_token: "tok" },
  clients: { name: "Cliente", email: "c@ejemplo.cl", client_contacts: [] },
});

const cuota = (quotationId: string, n: number, monto: number, pagado: number) =>
  ({
    id: `${quotationId}-${n}`,
    quotation_id: quotationId,
    payment_number: n,
    amount: monto,
    due_date: "2099-12-01",
    status: pagado >= monto ? "pagado" : "pendiente",
    paid_amount: pagado,
    quotations: cotizacion(quotationId, 600, "aceptada", 1000),
  }) as unknown as PaymentWithTransactions;

describe("armarFilas", () => {
  it("lo vencido de la fila es solo lo que falta de sus cuotas vencidas, no el saldo entero", () => {
    const vencida = {
      ...cuota("q411", 1, 400, 100),
      due_date: "2020-01-01",
    } as PaymentWithTransactions;
    const filas = armarFilas({
      payments: [vencida, cuota("q411", 2, 600, 0)],
      sinPlan: [],
      clients: [],
      refundsPaid: {},
    });
    expect(filas[0].status).toBe("vencido");
    // Total 1.000, pagado 100: faltan 900, pero vencidos son solo 300.
    expect(filas[0].overdue).toBe(300);
  });

  it("sin cuotas vencidas, lo vencido es cero", () => {
    const filas = armarFilas({
      payments: [cuota("q1", 1, 1000, 0)],
      sinPlan: [],
      clients: [],
      refundsPaid: {},
    });
    expect(filas[0].overdue).toBe(0);
  });

  it("un evento aceptado sin cuotas aparece, con 0 cuotas y el total pendiente", () => {
    const filas = armarFilas({
      payments: [],
      sinPlan: [cotizacion("q703", 703, "aceptada", 2821000)],
      clients: [],
      refundsPaid: {},
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      quotationId: "q703",
      quotationNumber: 703,
      cuotas: 0,
      total: 2821000,
      paid: 0,
      status: "pendiente",
      cancelled: false,
      portalToken: "tok",
    });
  });

  it("los anulados y realizados sin cuotas también, con su marca", () => {
    const filas = armarFilas({
      payments: [],
      sinPlan: [
        cotizacion("q412", 412, "cancelada", 1428000),
        cotizacion("q386", 386, "realizada", 330000),
      ],
      clients: [],
      refundsPaid: {},
    });
    expect(filas.map((f) => [f.quotationNumber, f.cancelled, f.done])).toEqual([
      [412, true, false],
      [386, false, true],
    ]);
  });

  it("las filas con cuotas siguen igual y no se duplican", () => {
    const filas = armarFilas({
      payments: [cuota("q600", 1, 400, 400), cuota("q600", 2, 600, 0)],
      sinPlan: [cotizacion("q600", 600, "aceptada", 1000)],
      clients: [],
      refundsPaid: {},
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      cuotas: 2,
      paid: 400,
      status: "pendiente",
    });
  });
});
