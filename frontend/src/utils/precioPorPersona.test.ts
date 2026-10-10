import { describe, expect, it } from "vitest";
import {
  porPrecioYNombre,
  precioPorPersonaDeMenu,
  precioPorPersonaDePaquete,
} from "./precioPorPersona";

const menu = (...lineas: [number, number][]) =>
  ({
    items: lineas.map(([price, quantity]) => ({
      quantity,
      service: { price },
    })),
  }) as never;

describe("precio por persona", () => {
  it("un menú suma sus ítems por cantidad", () => {
    expect(precioPorPersonaDeMenu(menu([9000, 1], [1500, 2]))).toBe(12000);
  });

  it("un paquete suma menús y sueltos, sin los fijos", () => {
    const paquete = {
      groups: [{ group: menu([8700, 1]) }, { group: menu([16400, 1]) }],
      services: [{ quantity: 2, service: { price: 18000 } }],
      fixed_services: [{ quantity: 1, service: { id: 1, name: "Salón" } }],
    } as never;
    expect(precioPorPersonaDePaquete(paquete)).toBe(8700 + 16400 + 36000);
  });

  it("un paquete solo de fijos, o un menú que ya no existe, da 0", () => {
    expect(
      precioPorPersonaDePaquete({ groups: [{ group: null }] } as never),
    ).toBe(0);
  });

  it("para elegir: de menor a mayor precio y, a igual precio, por nombre", () => {
    const menus = [
      { name: "Filete - Papas gratinadas y vino", precio: 23900 },
      { name: "Trutro de pollo - Arroz", precio: 9900 },
      { name: "pastel de papas - Leche asada", precio: 13400 },
      { name: "Cazuela de ave - Leche asada", precio: 13400 },
    ];
    expect(
      [...menus].sort(porPrecioYNombre((m) => m.precio)).map((m) => m.name),
    ).toEqual([
      "Trutro de pollo - Arroz",
      "Cazuela de ave - Leche asada",
      "pastel de papas - Leche asada",
      "Filete - Papas gratinadas y vino",
    ]);
  });
});
