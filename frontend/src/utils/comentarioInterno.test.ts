import { describe, expect, it } from "vitest";
import {
  comentarioNoCargado,
  comentarioParaGuardar,
} from "./comentarioInterno";

describe("comentario interno al guardar", () => {
  it("si la cotización llegó sin el campo, no viaja (no pisa lo guardado)", () => {
    expect(comentarioParaGuardar(undefined)).toEqual({});
    expect(comentarioNoCargado(undefined)).toBe(true);
  });

  it("el texto viaja tal cual", () => {
    expect(comentarioParaGuardar("Menú económico, tres días")).toEqual({
      comentario_interno: "Menú económico, tres días",
    });
  });

  it("en blanco viaja como null (se borra a propósito)", () => {
    expect(comentarioParaGuardar("")).toEqual({ comentario_interno: null });
    expect(comentarioParaGuardar("   ")).toEqual({ comentario_interno: null });
    expect(comentarioParaGuardar(null)).toEqual({ comentario_interno: null });
  });

  it("vacío o null sí se cargó: se puede editar", () => {
    expect(comentarioNoCargado("")).toBe(false);
    expect(comentarioNoCargado(null)).toBe(false);
  });
});
