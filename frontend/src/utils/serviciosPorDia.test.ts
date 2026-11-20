import { describe, expect, it } from "vitest";
import {
  comidasDelDia,
  contarDiasDelEvento,
  insertarEnDia,
  moverDentroDelDia,
  numerarPorDia,
  rotuloCortoDeDia,
  rotuloDeDia,
  tipoDeCaja,
} from "./serviciosPorDia";

// SERVICIOS ORDENADOS POR DÍA (20-11-2026): qué comida es cada casilla,
// el rótulo del día y las flechas que no se salen de su día.

describe("tipoDeCaja", () => {
  it("lee la categoría de Joker y la de Valle del Sol", () => {
    expect(tipoDeCaja(undefined, "Sernatur - almuerzo")).toBe("almuerzo");
    expect(tipoDeCaja(undefined, "Sernatur - cena")).toBe("cena");
    expect(tipoDeCaja(undefined, "Sernatur - desayuno")).toBe("desayuno");
    expect(tipoDeCaja(undefined, "Servicios de Ingreso")).toBe("alojamiento");
    expect(tipoDeCaja(undefined, "Alojamiento")).toBe("alojamiento");
    expect(tipoDeCaja(undefined, "Desayunos & Onces")).toBe("desayuno");
  });

  it("«Almuerzos & Cenas» es ambigua", () => {
    expect(tipoDeCaja(undefined, "Almuerzos & Cenas")).toBe("ambigua");
  });

  it("el nombre del menú manda sobre la categoría", () => {
    expect(tipoDeCaja("Sernatur Almuerzo Día 3", "Almuerzos & Cenas")).toBe(
      "almuerzo",
    );
    expect(tipoDeCaja("Cena de gala", "Almuerzos & Cenas")).toBe("cena");
    expect(tipoDeCaja("Sernatur Desayuno Día 1", "Otra cosa")).toBe("desayuno");
  });

  it("un nombre sin comida deja decidir a la categoría", () => {
    expect(tipoDeCaja("Menú premium", "Sernatur - cena")).toBe("cena");
    expect(tipoDeCaja("Menú premium", "Almuerzos & Cenas")).toBe("ambigua");
  });

  it("lo demás es extra (sin confundir «escena» con cena)", () => {
    expect(tipoDeCaja(undefined, "Extras")).toBe("extra");
    expect(tipoDeCaja(undefined, "Puesta en escena")).toBe("extra");
    expect(tipoDeCaja(undefined, "")).toBe("extra");
  });
});

describe("comidasDelDia", () => {
  it("una ambigua llena primero Almuerzo y después Cena", () => {
    expect([...comidasDelDia(["ambigua"]).comidas]).toEqual(["almuerzo"]);
    expect(comidasDelDia(["ambigua", "ambigua"]).comidas).toEqual(
      new Set(["almuerzo", "cena"]),
    );
    expect(comidasDelDia(["almuerzo", "ambigua"]).comidas).toEqual(
      new Set(["almuerzo", "cena"]),
    );
  });

  it("marca el extra", () => {
    expect(comidasDelDia(["desayuno", "extra"])).toEqual({
      comidas: new Set(["desayuno"]),
      extra: true,
    });
  });
});

describe("rótulos y días", () => {
  it("«Día N · día de la semana dd-mm» en UTC", () => {
    expect(rotuloDeDia(1, "2026-11-22")).toEqual({
      titulo: "Día 1",
      fecha: "domingo 22-11",
    });
    expect(rotuloDeDia(2, "2026-11-22T00:00:00.000Z").fecha).toBe(
      "lunes 23-11",
    );
    expect(rotuloDeDia(3, null)).toEqual({ titulo: "Día 3", fecha: "" });
  });

  it("el rótulo corto del selector sigue igual", () => {
    expect(rotuloCortoDeDia(6, "2026-11-22")).toMatch(/^Día 6 \(27.11\)$/);
  });

  it("cuenta los días del rango con las rejas de siempre", () => {
    expect(contarDiasDelEvento("2026-11-22", "2026-11-27")).toBe(6);
    expect(contarDiasDelEvento("2026-11-22", null)).toBe(1);
    expect(contarDiasDelEvento("2026-11-22", "2026-11-20")).toBe(1);
    expect(contarDiasDelEvento("2026-01-01", "2027-01-01")).toBe(60);
  });
});

type C = { id: string; day: number };
const dia = (c: C) => c.day;
const ids = (cs: C[]) => cs.map((c) => c.id).join("");

describe("moverDentroDelDia", () => {
  const cajas: C[] = [
    { id: "a", day: 1 },
    { id: "b", day: 2 },
    { id: "c", day: 1 },
    { id: "d", day: 2 },
  ];
  it("salta las casillas de otros días", () => {
    expect(ids(moverDentroDelDia(cajas, 0, 1, dia))).toBe("bcad");
    expect(ids(moverDentroDelDia(cajas, 2, -1, dia))).toBe("cabd");
    expect(ids(moverDentroDelDia(cajas, 1, 1, dia))).toBe("acdb");
  });
  it("sin vecina de su día no se mueve", () => {
    expect(moverDentroDelDia(cajas, 0, -1, dia)).toBe(cajas);
    expect(moverDentroDelDia(cajas, 3, 1, dia)).toBe(cajas);
  });
  it("con un solo día es el movimiento de siempre", () => {
    const uno = cajas.map((c) => ({ ...c, day: 1 }));
    expect(ids(moverDentroDelDia(uno, 1, -1, dia))).toBe("bacd");
  });
});

describe("insertarEnDia", () => {
  const cajas: C[] = [
    { id: "a", day: 1 },
    { id: "c", day: 1 },
    { id: "b", day: 3 },
  ];
  const meter = (d: number) =>
    ids(insertarEnDia(cajas, { id: "n", day: d }, d, dia));
  it("entra tras la última casilla de ese día", () => {
    expect(meter(1)).toBe("acnb");
    expect(meter(3)).toBe("acbn");
  });
  it("un día vacío entra tras la última de un día anterior", () => {
    expect(meter(2)).toBe("acnb");
    expect(meter(0)).toBe("nacb");
  });
  it("sin día, al final", () => {
    expect(ids(insertarEnDia(cajas, { id: "n", day: 1 }, Infinity, dia))).toBe(
      "acbn",
    );
  });
});

describe("numerarPorDia", () => {
  it("numera corrido de banda en banda", () => {
    const cajas: C[] = [
      { id: "a", day: 2 },
      { id: "b", day: 1 },
      { id: "c", day: 2 },
      { id: "d", day: 1 },
    ];
    expect(numerarPorDia(cajas, dia)).toEqual([3, 1, 4, 2]);
  });
});
