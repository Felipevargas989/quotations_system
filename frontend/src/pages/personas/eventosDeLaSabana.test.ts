import { describe, it, expect } from "vitest";
import {
  compararEventos,
  costoDeLaGente,
  diasConMas,
  diasDe,
  eventoEnRango,
  eventosDelDia,
  pagoDelDia,
  pesos,
} from "./eventosDeLaSabana";

/**
 * LOS EVENTOS DE LA SÁBANA (Felipe, 09-11-2026). El caso real: la #460
 * Municipalidad de Quillón, del jueves 29-10, no tenía sillas en Gestión
 * y no aparecía en la sábana; la gente de ese día quedó en Staff.
 */
const m460 = { inicio: "2026-10-29", termino: null };
const ecofor = { inicio: "2026-10-26", termino: "2026-11-06" };

describe("diasDe", () => {
  it("sin término, el evento dura un día", () => {
    expect([...diasDe(m460)]).toEqual(["2026-10-29"]);
  });
  it("cruza de mes día por día", () => {
    const d = [...diasDe(ecofor)];
    expect(d).toHaveLength(12);
    expect(d[0]).toBe("2026-10-26");
    expect(d).toContain("2026-11-01");
    expect(d[11]).toBe("2026-11-06");
  });
  it("sin fecha no tiene días", () => {
    expect(diasDe({ inicio: null, termino: null }).size).toBe(0);
  });
});

describe("diasConMas", () => {
  it("suma 4 días antes y 4 después, como Gestión", () => {
    const d = [...diasConMas(m460)];
    expect(d[0]).toBe("2026-10-25");
    expect(d[d.length - 1]).toBe("2026-11-02");
    expect(d).toHaveLength(9);
  });
  it("con término, cuenta desde el último día del evento", () => {
    const d = diasConMas(ecofor);
    expect(d.has("2026-10-22")).toBe(true);
    expect(d.has("2026-10-21")).toBe(false);
    expect(d.has("2026-11-10")).toBe(true);
    expect(d.has("2026-11-11")).toBe(false);
  });
});

describe("eventoEnRango", () => {
  it("se ve si toca el rango aunque sea un día", () => {
    expect(eventoEnRango(ecofor, "2026-11-01", "2026-11-28")).toBe(true);
    expect(eventoEnRango(m460, "2026-10-11", "2026-11-07")).toBe(true);
  });
  it("no se ve si cae entero afuera", () => {
    expect(eventoEnRango(m460, "2026-11-01", "2026-11-28")).toBe(false);
    expect(
      eventoEnRango(
        { inicio: null, termino: null },
        "2026-11-01",
        "2026-11-28",
      ),
    ).toBe(false);
  });
});

describe("eventosDelDia", () => {
  it("nombra los eventos de ese día, no los de sus días extra", () => {
    const eventos = [
      { id: "460", ...m460 },
      { id: "616", ...ecofor },
    ];
    expect(eventosDelDia(eventos, "2026-10-29").map((e) => e.id)).toEqual([
      "460",
      "616",
    ]);
    expect(eventosDelDia(eventos, "2026-10-25").map((e) => e.id)).toEqual([]);
  });
});

describe("pagoDelDia y costoDeLaGente", () => {
  it("la planta va en blanco salvo que tenga un adicional", () => {
    expect(pagoDelDia({ kind: "planta", amount: null })).toBeNull();
    expect(pagoDelDia({ kind: "planta", amount: 0 })).toBeNull();
    expect(pagoDelDia({ kind: "planta", amount: 10000 })).toBe(10000);
  });
  it("el freelance suma su monto, aunque venga como texto", () => {
    expect(
      pagoDelDia({ kind: "freelance", amount: "25000" as unknown as number }),
    ).toBe(25000);
    expect(pagoDelDia({ kind: "freelance", amount: null })).toBeNull();
  });
  it("el 29-10: staff $130.000 y la planta no suma", () => {
    const staff = [25000, 25000, 25000, 30000, 25000].map((amount) => ({
      kind: "freelance" as const,
      amount,
    }));
    const planta = [null, null, null, null, null].map((amount) => ({
      kind: "planta" as const,
      amount,
    }));
    expect(costoDeLaGente(staff)).toBe(130000);
    expect(costoDeLaGente(planta)).toBe(0);
  });
  it("pesos sin decimales", () => {
    expect(pesos(180000)).toBe("$180.000");
  });
});

describe("compararEventos (en cascada)", () => {
  it("del que parte antes al último; mismo día, el que termina antes", () => {
    const eventos = [
      { numero: 384, inicio: "2026-11-27", termino: null },
      { numero: 500, inicio: "2026-11-09", termino: "2026-11-22" },
      { numero: 521, inicio: "2026-11-04", termino: "2026-11-09" },
      { numero: 392, inicio: "2026-11-24", termino: "2026-11-26" },
      { numero: 536, inicio: "2026-11-24", termino: null },
    ];
    const orden = [...eventos].sort(compararEventos).map((e) => e.numero);
    expect(orden).toEqual([521, 500, 536, 392, 384]);
  });
  it("un evento sin datos va al final", () => {
    const conFecha = {
      numero: 616,
      inicio: "2026-10-26",
      termino: "2026-11-06",
    };
    expect(compararEventos(undefined, conFecha)).toBeGreaterThan(0);
    expect(compararEventos(conFecha, undefined)).toBeLessThan(0);
  });
  it("mismas fechas: por número", () => {
    const a = { numero: 521, inicio: "2026-11-04", termino: "2026-11-09" };
    const b = { numero: 522, inicio: "2026-11-04", termino: "2026-11-09" };
    expect(compararEventos(a, b)).toBeLessThan(0);
  });
});
