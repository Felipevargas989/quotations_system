import { describe, expect, it } from "vitest";
import { filasALineas } from "./leerArchivoDeContactos";

describe("filasALineas (el lector de planillas del importador)", () => {
  it("encuentra las columnas por nombre, en español", () => {
    const r = filasALineas([
      ["Nombre", "Correo electrónico", "Empresa / Institución"],
      ["Paola Lagos", "PAOLA@empresa.cl", "Colegio Alemán"],
      ["", "juan@otra.cl", ""],
    ]);
    expect(r.sinCorreo).toBe(false);
    expect(r.lineas).toEqual([
      "paola@empresa.cl,Paola Lagos,Colegio Alemán",
      "juan@otra.cl,,",
    ]);
  });

  it("sin encabezados asume correo/nombre/empresa si la primera columna trae correos", () => {
    const r = filasALineas([
      ["ana@x.cl", "Ana", "Su Empresa"],
      ["beto@y.cl", "Beto", ""],
    ]);
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0]).toBe("ana@x.cl,Ana,Su Empresa");
  });

  it("limpia comas dentro de nombre y empresa (romperían el pegado)", () => {
    const r = filasALineas([
      ["Email", "Nombre"],
      ["c@x.cl", "Pérez, Juan"],
    ]);
    expect(r.lineas[0]).toBe("c@x.cl,Pérez Juan,");
  });

  it("una planilla sin columna de correos avisa en vez de adivinar", () => {
    const r = filasALineas([
      ["Producto", "Precio"],
      ["Quincho", "50000"],
    ]);
    expect(r.sinCorreo).toBe(true);
    expect(r.lineas).toHaveLength(0);
  });
});
