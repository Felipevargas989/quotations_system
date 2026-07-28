import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, telHref } from "./phone";

// Primeras pruebas del frontend (Fase 2 Bloque C). Los casos salen de
// la especificación escrita en los comentarios de phone.ts.
describe("normalizePhone — guardar pelado", () => {
  it("entiende todas las formas de escribir el mismo celular", () => {
    const canonico = "+56950955947";
    expect(normalizePhone("950955947")).toBe(canonico);
    expect(normalizePhone("9 5095 5947")).toBe(canonico);
    expect(normalizePhone("+56 9 5095 5947")).toBe(canonico);
    expect(normalizePhone("56950955947")).toBe(canonico);
    expect(normalizePhone("09 5095 5947")).toBe(canonico); // prefijo viejo
    expect(normalizePhone("0056950955947")).toBe(canonico);
  });

  it("entiende fijos de región con paréntesis", () => {
    expect(normalizePhone("(42) 234 5678")).toBe("+56422345678");
  });

  it("lo que no calza se devuelve fiel, sin inventar dígitos", () => {
    expect(normalizePhone("+1 555 0100")).toBe("+1 555 0100");
    expect(normalizePhone("12345")).toBe("12345");
    expect(normalizePhone("")).toBe("");
  });
});

describe("formatPhone — mostrar vestido", () => {
  it("celular: 1 + 4 + 4", () => {
    expect(formatPhone("+56950955947")).toBe("+56 9 5095 5947");
  });

  it("fijo de Santiago: 1 + 4 + 4", () => {
    expect(formatPhone("+56223456789")).toBe("+56 2 2345 6789");
  });

  it("fijo de región (Ñuble es 42): 2 + 3 + 4", () => {
    expect(formatPhone("+56422345678")).toBe("+56 42 234 5678");
  });

  it("lo no chileno se muestra tal cual", () => {
    expect(formatPhone("+1 555 0100")).toBe("+1 555 0100");
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});

describe("telHref — el marcador recibe el número pelado", () => {
  it("normaliza antes de armar el enlace", () => {
    expect(telHref("+56 9 5095 5947")).toBe("tel:+56950955947");
  });
});
