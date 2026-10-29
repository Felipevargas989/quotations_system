import { describe, it, expect } from "vitest";
import {
  asignarPistas,
  loVendidoPrimero,
  type TramoDelEvento,
} from "./ordenDelCalendario";

/**
 * LO VENDIDO PRIMERO (28-10-2026). Felipe: "el calendario puede mostrar
 * primero lo aceptado tanto en el resumen como en el calendario".
 */
const tramo = (
  id: string,
  start: string,
  end: string,
  vendido = false,
): TramoDelEvento => ({ id, start, end, vendido });

describe("loVendidoPrimero (panel del día)", () => {
  it("aceptado y realizado arriba; cada grupo en el orden que traía", () => {
    const eventos = [
      { id: "a", quotation_status: "enviada" },
      { id: "b", quotation_status: "aceptada" },
      { id: "c", quotation_status: "en_negociacion" },
      { id: "d", quotation_status: "realizada" },
      { id: "e", quotation_status: "solicitada" },
    ];
    expect(loVendidoPrimero(eventos).map((q) => q.id)).toEqual([
      "b",
      "d",
      "a",
      "c",
      "e",
    ]);
  });
});

describe("asignarPistas (bandas del calendario)", () => {
  it("el aceptado toma la fila de arriba aunque otro empiece antes", () => {
    const pistas = asignarPistas([
      tramo("enviada", "2026-11-05", "2026-11-07"),
      tramo("aceptada", "2026-11-06", "2026-11-06", true),
    ]);
    expect(pistas.get("aceptada")).toBe(0);
    expect(pistas.get("enviada")).toBe(1);
  });

  it("con cuatro en juego el mismo día, el aceptado sigue a la vista y no cae en «+N más»", () => {
    const pistas = asignarPistas([
      tramo("e1", "2026-11-06", "2026-11-06"),
      tramo("e2", "2026-11-06", "2026-11-06"),
      tramo("e3", "2026-11-06", "2026-11-06"),
      tramo("a", "2026-11-06", "2026-11-06", true),
    ]);
    // Se ven 3 filas por día (MAX_BAND_LANES): la 0, la 1 y la 2.
    expect(pistas.get("a")).toBe(0);
    expect(pistas.get("e3")).toBe(3);
  });

  it("lo que sigue en juego aprovecha los huecos entre dos vendidos", () => {
    const pistas = asignarPistas([
      tramo("v1", "2026-11-01", "2026-11-03", true),
      tramo("v2", "2026-11-10", "2026-11-12", true),
      tramo("enviada", "2026-11-05", "2026-11-06"),
    ]);
    expect(pistas.get("v1")).toBe(0);
    expect(pistas.get("v2")).toBe(0);
    expect(pistas.get("enviada")).toBe(0);
  });

  it("sin vendidos, igual que antes: primero el que empieza antes y, el mismo día, el más largo", () => {
    const pistas = asignarPistas([
      tramo("corto", "2026-11-01", "2026-11-01"),
      tramo("largo", "2026-11-01", "2026-11-04"),
      tramo("despues", "2026-11-02", "2026-11-02"),
      tramo("libre", "2026-11-05", "2026-11-05"),
    ]);
    expect(pistas.get("largo")).toBe(0);
    expect(pistas.get("corto")).toBe(1);
    expect(pistas.get("despues")).toBe(1);
    expect(pistas.get("libre")).toBe(0);
  });

  it("dos eventos que se topan nunca comparten fila, ni en el día del borde", () => {
    const pistas = asignarPistas([
      tramo("a", "2026-11-01", "2026-11-03", true),
      tramo("b", "2026-11-03", "2026-11-05"),
    ]);
    expect(pistas.get("a")).not.toBe(pistas.get("b"));
  });
});
