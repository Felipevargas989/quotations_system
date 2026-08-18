import { describe, it, expect } from "vitest";
import { esPlanificacion, estadoDelPago } from "./estadoDelPago";

/**
 * UN SOLO MONTO, DOS ESTADOS (Felipe, 17-08).
 *
 * La pantalla mostraba "parcial" a seis personas con "0 de 7 pagadas":
 * quien solo tenía propina daba la jornada por resuelta —no tenía— y eso
 * contaba como algo pagado. Y como al banco sube UNA transferencia por
 * persona, el parcial no existe: pendiente o pagada.
 */
describe("estadoDelPago", () => {
  const sinMarca = { jornada_paid: false, propina_paid: false };

  it("solo propina, nada marcado: pendiente", () => {
    expect(
      estadoDelPago({ totalJornada: 0, totalPropina: 12000, pagos: [sinMarca] }),
    ).toBe("pendiente");
  });

  it("solo propina, marcada: pagada", () => {
    expect(
      estadoDelPago({
        totalJornada: 0,
        totalPropina: 12000,
        pagos: [{ jornada_paid: false, propina_paid: true }],
      }),
    ).toBe("pagada");
  });

  it("jornada y propina, una sola marcada: sigue PENDIENTE", () => {
    // No existe el parcial: se le debe plata todavía.
    expect(
      estadoDelPago({
        totalJornada: 30000,
        totalPropina: 14000,
        pagos: [{ jornada_paid: true, propina_paid: false }],
      }),
    ).toBe("pendiente");
  });

  it("jornada y propina, las dos marcadas: pagada", () => {
    expect(
      estadoDelPago({
        totalJornada: 30000,
        totalPropina: 14000,
        pagos: [{ jornada_paid: true, propina_paid: true }],
      }),
    ).toBe("pagada");
  });

  it("sin ninguna marca todavía NO es pagada", () => {
    // `every` sobre una lista vacía es verdadero: sin este caso, alguien
    // recién entrado a la nómina salía pagado sin cobrar.
    expect(
      estadoDelPago({ totalJornada: 30000, totalPropina: 0, pagos: [] }),
    ).toBe("pendiente");
  });

  it("dos fichas con el mismo RUT: pagada solo si las dos están marcadas", () => {
    expect(
      estadoDelPago({
        totalJornada: 30000,
        totalPropina: 0,
        pagos: [
          { jornada_paid: true, propina_paid: false },
          { jornada_paid: false, propina_paid: false },
        ],
      }),
    ).toBe("pendiente");
  });

  it("nada que pagar: pendiente, no hubo transferencia", () => {
    expect(estadoDelPago({ totalJornada: 0, totalPropina: 0, pagos: [] })).toBe(
      "pendiente",
    );
  });
});

describe("esPlanificacion", () => {
  it("en el restaurante, todo es planificación (planta o freelance)", () => {
    expect(esPlanificacion({ quotation_id: null, kind: "planta" })).toBe(true);
    expect(esPlanificacion({ quotation_id: null, kind: "freelance" })).toBe(true);
  });
  it("en un evento, la planta viene de la ficha: NO es planificación", () => {
    expect(esPlanificacion({ quotation_id: "q1", kind: "planta" })).toBe(false);
  });
  it("en un evento, lo freelance (silla o persona) sí lo es", () => {
    expect(esPlanificacion({ quotation_id: "q1", kind: "freelance" })).toBe(true);
  });
});
