import { describe, expect, it } from "vitest";
import {
  clientesParaElCotizador,
  estadosPara,
  tiposQueTrabaja,
} from "./recepcion";

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

// Doc 22 §9: los tipos que trabaja cada cargo los manda el motor en el
// perfil; sin el dato, lo de fábrica.
describe("tiposQueTrabaja y el cotizador, con el perfil", () => {
  const TIPOS = [
    { name: "Particulares", es_particular: true },
    { name: "Empresas" },
    { name: "Club Adulto Mayor" },
  ];
  const clientes = [
    { id: "a", client_type: "Particulares" },
    { id: "b", client_type: "Empresas" },
    { id: "c", client_type: "Club Adulto Mayor" },
  ];

  it("sin el dato del motor, lo de fábrica", () => {
    expect(tiposQueTrabaja("recepcion", TIPOS)).toEqual(
      new Set(["particulares"]),
    );
    expect(tiposQueTrabaja("vendedor", TIPOS)).toBeNull();
  });

  it("con el perfil: los que dice el motor, a cualquier cargo", () => {
    expect(
      clientesParaElCotizador("vendedor", clientes, TIPOS, null, [
        "Particulares",
        "Club Adulto Mayor",
      ]).map((c) => c.id),
    ).toEqual(["a", "c"]);
    expect(
      clientesParaElCotizador("recepcion", clientes, TIPOS, "b", [
        "Club Adulto Mayor",
      ]).map((c) => c.id),
    ).toEqual(["b", "c"]);
    expect(
      clientesParaElCotizador("recepcion", clientes, TIPOS, null, null),
    ).toHaveLength(3);
  });
});
