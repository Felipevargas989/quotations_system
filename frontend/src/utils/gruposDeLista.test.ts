import { describe, expect, it } from "vitest";
import { nombreBajoElGrupo, ordenarPorGrupo } from "./gruposDeLista";

// UNA LISTA POR GRUPOS (12-10-2026, migraciones 120 y 121): la misma regla
// para paquetes y menús guardados.

const grupos = [
  { id: 10, name: "Matrimonio", sort_order: 2 },
  { id: 20, name: "Full day", sort_order: 1 },
];

const e = (name: string, grupo: number | null, precio: number) => ({
  name,
  grupo,
  precio,
});

const porPrecio = (a: { precio: number }, b: { precio: number }) =>
  a.precio - b.precio;

describe("una lista por grupos", () => {
  it("grupos en su orden, por precio dentro y los sin grupo al final", () => {
    const r = ordenarPorGrupo(
      [
        e("De noche", 10, 64100),
        e("Empresa", 20, 57000),
        e("Viejo", null, 1000),
        e("Adulto mayor", 20, 34300),
        e("De un grupo borrado", 99, 500),
      ],
      grupos,
      (x) => x.grupo,
      porPrecio,
    );
    expect(r.map((x) => [x.elemento.name, x.grupo?.name ?? null])).toEqual([
      ["Adulto mayor", "Full day"],
      ["Empresa", "Full day"],
      ["De noche", "Matrimonio"],
      ["De un grupo borrado", null],
      ["Viejo", null],
    ]);
  });

  it("sin grupos creados, la lista es solo por precio", () => {
    const r = ordenarPorGrupo(
      [e("Caro", null, 50000), e("Barato", null, 20000)],
      [],
      (x) => x.grupo,
      porPrecio,
    );
    expect(r.map((x) => x.elemento.name)).toEqual(["Barato", "Caro"]);
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
