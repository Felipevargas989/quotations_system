import { describe, it, expect } from "vitest";
import { valorSePuedeMostrar } from "./SelectWithSearch";

/**
 * QUÉ SE MUESTRA CUANDO EL VALOR GUARDADO NO ESTÁ EN LA LISTA.
 *
 * La pieza rescata a propósito el NOMBRE guardado —una categoría que se
 * renombró o se dio de baja se sigue viendo, para no hacer creer que el
 * dato se perdió—, pero 17 pantallas guardan un ID. Mostrar el id crudo
 * era peor que no mostrar nada (revisión del 16-08).
 */
describe("valorSePuedeMostrar", () => {
  it("un nombre se muestra aunque ya no esté en el catálogo", () => {
    expect(valorSePuedeMostrar("Categoría que se dio de baja")).toBe(true);
    expect(valorSePuedeMostrar("Florería Básica")).toBe(true);
  });

  it("un id numérico NO: en Insumos se veía un '7' donde iba el proveedor", () => {
    expect(valorSePuedeMostrar("7")).toBe(false);
    expect(valorSePuedeMostrar("1024")).toBe(false);
  });

  it("un UUID NO: aparecía al abrir una cotización mientras cargaba", () => {
    expect(valorSePuedeMostrar("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      false,
    );
    expect(valorSePuedeMostrar("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(
      false,
    );
  });

  it("sin valor no hay nada que mostrar", () => {
    expect(valorSePuedeMostrar("")).toBe(false);
    expect(valorSePuedeMostrar(null)).toBe(false);
    expect(valorSePuedeMostrar(undefined)).toBe(false);
  });

  it("un nombre que empieza con números sí se muestra", () => {
    // "2 Tortas" es un nombre, no un id: solo se descarta el número puro.
    expect(valorSePuedeMostrar("2 Tortas")).toBe(true);
  });
});
