import { describe, it, expect } from "vitest";
import {
  cuotaConPlata,
  fechaDelSaldo,
  filasIniciales,
  planCubreElTotal,
  propuestaDeMontos,
} from "./planDePagos";
import { montoDelAbono } from "./abonoParaReservar";

/**
 * EL PLAN DE PAGOS (Felipe, 28-10-2026; doc 14 §Editar el plan). Caso 703:
 * $2.821.000 y evento el 09-12. Felipe lo dejó en 30% ($846.300) para el
 * 28-10 y saldo ($1.974.700) para el 02-12, siete días antes.
 */
const HOY = "2026-10-28";

describe("filasIniciales", () => {
  it("la 703: abono del 30% hoy y saldo 7 días antes del evento", () => {
    const abono = montoDelAbono(2821000, "30.00");
    expect(abono).toBe(846300);
    expect(
      filasIniciales({
        objetivo: 2821000,
        abono,
        conPagos: 0,
        hoy: HOY,
        fechaEvento: "2026-12-09T00:00:00+00:00",
      }),
    ).toEqual([
      { label: "Cuota 1", due_date: HOY, amount: 846300 },
      { label: "Cuota 2", due_date: "2026-12-02", amount: 1974700 },
    ]);
  });

  it("sin % de abono en la empresa: una cuota por el total, como antes", () => {
    expect(
      filasIniciales({
        objetivo: 500000,
        abono: null,
        conPagos: 0,
        hoy: HOY,
        fechaEvento: "2026-12-09",
      }),
    ).toEqual([{ label: "Cuota 1", due_date: HOY, amount: 500000 }]);
  });

  it("con cuotas pagadas: una sola cuota por lo que falta, en la fecha del saldo", () => {
    expect(
      filasIniciales({
        objetivo: 1974700,
        abono: null,
        conPagos: 1,
        hoy: HOY,
        fechaEvento: "2026-12-09",
      }),
    ).toEqual([{ label: "Cuota 2", due_date: "2026-12-02", amount: 1974700 }]);
  });

  it("si lo pagado ya cubre el total, no hay filas que repartir", () => {
    expect(
      filasIniciales({ objetivo: 0, abono: null, conPagos: 2, hoy: HOY }),
    ).toEqual([]);
  });
});

describe("fechaDelSaldo", () => {
  it("siete días antes del evento", () => {
    expect(fechaDelSaldo("2026-12-09T00:00:00+00:00", HOY)).toBe("2026-12-02");
  });
  it("nunca antes de hoy, y sin fecha de evento es hoy", () => {
    expect(fechaDelSaldo("2026-10-30", HOY)).toBe(HOY);
    expect(fechaDelSaldo(null, HOY)).toBe(HOY);
  });
});

describe("propuestaDeMontos", () => {
  it("con abono: la primera es el abono y el resto se reparte parejo", () => {
    expect(propuestaDeMontos(2821000, 3, 846300)).toEqual([
      846300, 987350, 987350,
    ]);
  });
  it("sin abono: todas parejas, el resto a la primera", () => {
    expect(propuestaDeMontos(1000001, 3, null)).toEqual([
      333335, 333333, 333333,
    ]);
  });
  it("un abono que no cabe no se usa", () => {
    expect(propuestaDeMontos(100, 2, 100)).toEqual([50, 50]);
  });
});

describe("planCubreElTotal y cuotaConPlata", () => {
  it("las cuotas cubren el total al peso, aunque lleguen como texto", () => {
    expect(
      planCubreElTotal([{ amount: "846300" }, { amount: 1974700 }], 2821000),
    ).toBe(true);
    expect(planCubreElTotal([{ amount: 846300 }], 2821000)).toBe(false);
    expect(planCubreElTotal([], 0)).toBe(false);
  });
  it("una cuota con pagos o pagada no se mueve", () => {
    const base = {
      id: "c1",
      payment_number: 1,
      amount: 10,
      due_date: HOY,
    };
    expect(cuotaConPlata({ ...base, status: "pagado" })).toBe(true);
    expect(
      cuotaConPlata({
        ...base,
        status: "vencido",
        payment_transactions: [{ amount: 5 }],
      }),
    ).toBe(true);
    expect(cuotaConPlata({ ...base, status: "pendiente" })).toBe(false);
  });
});
