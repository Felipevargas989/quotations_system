import { describe, expect, it } from "vitest";
import { avisoDelDictado, loDictado } from "./useDictado";

// Hablarle a BelIA (doc 20 §17, mejora 1), sin pantalla: cómo se junta lo
// que el navegador va oyendo y qué se le dice a la persona si falla.

const trozo = (transcript: string, isFinal: boolean) => ({
  isFinal,
  0: { transcript },
});

describe("loDictado", () => {
  it("junta los trozos y dice si la frase ya cerró", () => {
    expect(
      loDictado([trozo("¿qué tengo", true), trozo(" que revisar hoy?", true)]),
    ).toEqual({ texto: "¿qué tengo que revisar hoy?", final: true });
  });
  it("mientras queda un trozo provisorio no es el final", () => {
    expect(loDictado([trozo("agrega un ", false)])).toEqual({
      texto: "agrega un",
      final: false,
    });
  });
  it("sin trozos no hay texto", () => {
    expect(loDictado([])).toEqual({ texto: "", final: true });
  });
});

describe("avisoDelDictado", () => {
  it("callado o cortado a propósito no avisa nada", () => {
    expect(avisoDelDictado("no-speech")).toBeNull();
    expect(avisoDelDictado("aborted")).toBeNull();
  });
  it("sin permiso lo dice claro", () => {
    expect(avisoDelDictado("not-allowed")).toMatch(/permiso/);
    expect(avisoDelDictado("service-not-allowed")).toMatch(/permiso/);
  });
  it("lo demás pide probar de nuevo", () => {
    expect(avisoDelDictado("network")).toMatch(/Prueba de nuevo/);
    expect(avisoDelDictado("audio-capture")).toMatch(/micrófono/);
  });
});
