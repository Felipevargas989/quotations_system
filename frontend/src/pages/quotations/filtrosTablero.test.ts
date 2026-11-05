// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  filtrosGuardados,
  guardarFiltros,
  olvidarFiltrosTablero,
} from "./filtrosTablero";

// La memoria de filtros del tablero, con los tipos de cliente (05-11-2026).

afterEach(() => sessionStorage.clear());

describe("la memoria de filtros del tablero", () => {
  it("recuerda los tipos de cliente elegidos, por usuario", () => {
    guardarFiltros("u1", { tipos: ["empresas", "club adulto mayor"] });
    expect(filtrosGuardados("u1").tipos).toEqual([
      "empresas",
      "club adulto mayor",
    ]);
    expect(filtrosGuardados("u2").tipos).toBeUndefined();
  });

  it("no confía en unos tipos que no tienen la forma esperada", () => {
    sessionStorage.setItem(
      "eventia_quotations_filtros_tablero_u1",
      JSON.stringify({ busqueda: "ccu", tipos: ["empresas", 3] }),
    );
    expect(filtrosGuardados("u1")).toEqual({ busqueda: "ccu" });
  });

  it("al crear una cotización olvida también los tipos", () => {
    guardarFiltros("u1", { tipos: ["empresas"] });
    olvidarFiltrosTablero("u1");
    expect(filtrosGuardados("u1")).toEqual({});
  });
});
