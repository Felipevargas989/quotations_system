import { describe, expect, it } from "vitest";
import { estadosPara } from "./recepcion";

// Recepción cotiza a los particulares (doc 21): sin aceptar, anular ni
// marcar realizada.

const TODOS = [
  "solicitada",
  "enviada",
  "en_negociacion",
  "aceptada",
  "rechazada",
];

describe("estadosPara", () => {
  it("a recepción no le ofrece aceptar, anular ni realizada", () => {
    expect(
      estadosPara("recepcion", [...TODOS, "cancelada"], "enviada"),
    ).toEqual(["solicitada", "enviada", "en_negociacion", "rechazada"]);
  });
  it("una que ya está aceptada le queda fija", () => {
    expect(estadosPara("recepcion", TODOS, "aceptada")).toEqual(["aceptada"]);
  });
  it("a los demás cargos, todo como siempre", () => {
    expect(estadosPara("vendedor", TODOS, "enviada")).toEqual(TODOS);
    expect(estadosPara("administrador", [...TODOS, "cancelada"])).toContain(
      "cancelada",
    );
  });
});
