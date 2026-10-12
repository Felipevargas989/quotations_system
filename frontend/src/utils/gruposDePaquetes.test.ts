import { describe, expect, it } from "vitest";
import { nombreBajoElGrupo, ordenarPorGrupo } from "./gruposDePaquetes";

// LOS PAQUETES EN SU LISTA (12-10-2026, migración 120).

const grupos = [
  { id: 10, name: "Matrimonio", sort_order: 2 },
  { id: 20, name: "Full day", sort_order: 1 },
];

const p = (name: string, package_group_id: number | null, precio: number) => ({
  name,
  package_group_id,
  precio,
});

const porPrecio = (a: { precio: number }, b: { precio: number }) =>
  a.precio - b.precio;

describe("paquetes por grupo", () => {
  it("grupos en su orden, por precio dentro y los sin grupo al final", () => {
    const r = ordenarPorGrupo(
      [
        p("De noche", 10, 64100),
        p("Empresa", 20, 57000),
        p("Viejo", null, 1000),
        p("Adulto mayor", 20, 34300),
        p("De un grupo borrado", 99, 500),
      ],
      grupos,
      porPrecio,
    );
    expect(r.map((x) => [x.paquete.name, x.grupo?.name ?? null])).toEqual([
      ["Adulto mayor", "Full day"],
      ["Empresa", "Full day"],
      ["De noche", "Matrimonio"],
      ["De un grupo borrado", null],
      ["Viejo", null],
    ]);
  });

  it("sin grupos creados, la lista es solo por precio", () => {
    const r = ordenarPorGrupo(
      [p("Caro", null, 50000), p("Barato", null, 20000)],
      [],
      porPrecio,
    );
    expect(r.map((x) => x.paquete.name)).toEqual(["Barato", "Caro"]);
  });

  it("bajo su título la fila no repite el grupo", () => {
    expect(nombreBajoElGrupo("Full day: estándar", "Full day")).toBe(
      "Estándar",
    );
    expect(nombreBajoElGrupo("full day: niños", "Full day")).toBe("Niños");
    expect(nombreBajoElGrupo("Matrimonio: de noche", "Full day")).toBe(
      "Matrimonio: de noche",
    );
    expect(nombreBajoElGrupo("Paquete de siempre", "Full day")).toBe(
      "Paquete de siempre",
    );
  });
});
