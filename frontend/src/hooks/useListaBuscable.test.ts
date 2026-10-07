import { describe, expect, it } from "vitest";
import { marcaAlEscribir } from "./useListaBuscable";

describe("marcaAlEscribir", () => {
  it("con algo escrito, marca la primera que calza (Enter la elige)", () => {
    expect(marcaAlEscribir("alm", false)).toBe(0);
  });

  it("con el buscador vacío, la lista plegable no marca nada", () => {
    expect(marcaAlEscribir("", false)).toBe(-1);
    expect(marcaAlEscribir("   ", false)).toBe(-1);
  });

  it("los agregadores marcan la primera siempre", () => {
    expect(marcaAlEscribir("", true)).toBe(0);
  });
});
