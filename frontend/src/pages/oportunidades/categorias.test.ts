import { describe, expect, it } from "vitest";
import {
  aOracion,
  etiquetaDeCategoria,
  opcionesDeCategoria,
} from "./categorias";

// Las categorías de ChileCompra en Configuración (decisión 111).

describe("Las categorías de ChileCompra para elegir el rubro", () => {
  it("se leen como oración, con tildes", () => {
    expect(aOracion("SERVICIOS PARA LA COMERCIALIZACIÓN Y DISTRIBUCIÓN")).toBe(
      "Servicios para la comercialización y distribución",
    );
  });

  it("cada una dice cuántas licitaciones tuvo y si es sugerida", () => {
    expect(
      etiquetaDeCategoria({
        categoria: "RESTAURANTES Y CATERING",
        licitaciones: 2176,
        sugerida: true,
      }),
    ).toBe("Restaurantes y catering · 2.176 licitaciones · sugerida");
    expect(
      etiquetaDeCategoria({
        categoria: "ARTES INTERPRETATIVAS",
        licitaciones: 1,
        sugerida: false,
      }),
    ).toBe("Artes interpretativas · 1 licitación");
  });

  it("van en el orden del motor, y una elegida que no viene igual sale para poder quitarla", () => {
    const opciones = opcionesDeCategoria(
      [
        {
          categoria: "RESTAURANTES Y CATERING",
          licitaciones: 516,
          sugerida: true,
        },
        {
          categoria: "TRANSPORTE DE PASAJEROS",
          licitaciones: 1792,
          sugerida: false,
        },
      ],
      ["RESTAURANTES Y CATERING", "BEBIDAS"],
    );
    expect(opciones.map((o) => o.value)).toEqual([
      "RESTAURANTES Y CATERING",
      "TRANSPORTE DE PASAJEROS",
      "BEBIDAS",
    ]);
    expect(opciones[2].label).toBe("Bebidas");
  });
});
