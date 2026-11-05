import { describe, expect, it } from "vitest";
import {
  coincideTipo,
  opcionesDeTipo,
  type OpcionDeTipo,
} from "./filtroPorTipo";

// El filtro por tipo de cliente del tablero (05-11-2026).

const q = (client_type: string | null) => ({ clients: { client_type } });

const TIPOS = [
  { name: "Club Adulto Mayor" },
  { name: "Empresas" },
  { name: "Particulares", es_particular: true },
];

/** «Nombre cantidad», para leer las opciones de un vistazo. */
const enCorto = (opciones: OpcionDeTipo[]) =>
  opciones.map((o) => `${o.label} ${o.cantidad}`);

describe("las opciones del filtro por tipo de cliente", () => {
  it("son los tipos de la empresa en su orden, con cuántas tarjetas tiene cada uno", () => {
    const tablero = [q("Empresas"), q("Particulares"), q("Empresas")];
    const opciones = opcionesDeTipo("vendedor", TIPOS, tablero, tablero);
    expect(enCorto(opciones)).toEqual([
      "Club Adulto Mayor 0",
      "Empresas 2",
      "Particulares 1",
    ]);
    expect(opciones.map((o) => o.value)).toEqual([
      "club adulto mayor",
      "empresas",
      "particulares",
    ]);
  });

  it("cada tipo trae el punto de su color de Clientes; sin tipo, gris", () => {
    const todas = [q(null)];
    const color = Object.fromEntries(
      opcionesDeTipo("vendedor", TIPOS, todas, todas).map((o) => [
        o.label,
        o.dotClass,
      ]),
    );
    expect(color["Empresas"]).toBe("bg-orange-500");
    expect(color["Particulares"]).toBe("bg-green-500");
    expect(color["Club Adulto Mayor"]).toMatch(/^bg-[a-z]+-500$/);
    expect(color["Sin tipo"]).toBe("bg-gray-300");
  });

  it("a recepción le ofrece solo los tipos particulares", () => {
    const tablero = [q("Particulares")];
    expect(
      enCorto(opcionesDeTipo("recepcion", TIPOS, tablero, tablero)),
    ).toEqual(["Particulares 1"]);
  });

  it("sin tipos particulares marcados, recepción no tiene filtro", () => {
    expect(
      opcionesDeTipo("recepcion", [{ name: "Empresas" }], [q("Empresas")], []),
    ).toEqual([]);
  });

  it("un tipo fuera de la lista y un cliente sin tipo van al final: ninguna tarjeta queda fuera", () => {
    const todas = [q("Empresa antigua"), q(null), q(" empresas ")];
    expect(
      enCorto(opcionesDeTipo("administrador", TIPOS, todas, todas)),
    ).toEqual([
      "Club Adulto Mayor 0",
      "Empresas 1",
      "Particulares 0",
      "Empresa antigua 1",
      "Sin tipo 1",
    ]);
  });

  it("la lista sale de todas las cargadas, pero cuenta solo lo que queda en el tablero", () => {
    const todas = [q("Empresa antigua"), q("Empresas")];
    const tablero = [q("Empresas")];
    expect(enCorto(opcionesDeTipo("vendedor", TIPOS, todas, tablero))).toEqual([
      "Club Adulto Mayor 0",
      "Empresas 1",
      "Particulares 0",
      "Empresa antigua 0",
    ]);
  });
});

describe("qué tarjetas pasan el filtro", () => {
  it("sin tipos elegidos, todas", () => {
    expect(coincideTipo([], q("Iglesias"))).toBe(true);
    expect(coincideTipo([], q(null))).toBe(true);
  });

  it("con tipos elegidos, solo las de esos tipos, sin importar mayúsculas ni espacios", () => {
    expect(coincideTipo(["empresas"], q("Empresas"))).toBe(true);
    expect(coincideTipo(["empresas"], q(" EMPRESAS "))).toBe(true);
    expect(coincideTipo(["empresas"], q("Particulares"))).toBe(false);
    expect(coincideTipo(["empresas", "iglesias"], q("Iglesias"))).toBe(true);
  });

  it("«Sin tipo» encuentra a los clientes sin tipo", () => {
    const [sinTipo] = opcionesDeTipo("vendedor", [], [q(null)], [q(null)]);
    expect(coincideTipo([sinTipo.value], q(null))).toBe(true);
    expect(coincideTipo([sinTipo.value], q("Empresas"))).toBe(false);
  });
});
