import { describe, expect, it } from "vitest";
import { clientesParaElCotizador, estadosPara } from "./recepcion";

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

describe("clientesParaElCotizador", () => {
  const clientes = [
    { id: "a", client_type: "Particulares" },
    { id: "b", client_type: "Empresas" },
    { id: "c", client_type: " particulares " },
  ];
  const tipos = [
    { name: "Particulares", es_particular: true },
    { name: "Empresas", es_particular: false },
  ];

  it("recepción ve solo a sus particulares, y el que ya está elegido", () => {
    expect(
      clientesParaElCotizador("recepcion", clientes, tipos).map((c) => c.id),
    ).toEqual(["a", "c"]);
    expect(
      clientesParaElCotizador("recepcion", clientes, tipos, "b").map(
        (c) => c.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("los demás cargos, todos; y sin tipos marcados, también todos", () => {
    expect(clientesParaElCotizador("vendedor", clientes, tipos)).toHaveLength(
      3,
    );
    expect(
      clientesParaElCotizador("recepcion", clientes, [
        { name: "Particulares" },
      ]),
    ).toHaveLength(3);
  });
});
