import { describe, expect, it } from "vitest";
import {
  validateClientForm,
  validateEmail,
  validatePhone,
} from "./validation";

// Fase 2 Bloque C: primeras pruebas de las validaciones de formularios.
describe("validateEmail", () => {
  it("acepta un correo normal", () => {
    expect(validateEmail("felipe@valledelsolquillon.cl")).toBe("");
  });

  it("rechaza un correo malformado", () => {
    expect(validateEmail("no-es-correo")).not.toBe("");
  });
});

describe("validatePhone", () => {
  it("acepta el formato chileno guardado (+56 y 9 dígitos)", () => {
    expect(validatePhone("+56950955947")).toBe("");
  });

  it("rechaza un número a medias", () => {
    expect(validatePhone("123")).not.toBe("");
  });
});

describe("validateClientForm — campos opcionales (Bloque C)", () => {
  it("valida cuando ambos vienen", () => {
    const r = validateClientForm({
      email: "a@b.cl",
      phone: "+56950955947",
    });
    expect(r.isValid).toBe(true);
  });

  it("los ausentes se tratan como vacíos, sin reventar", () => {
    const r = validateClientForm({});
    expect(typeof r.isValid).toBe("boolean");
    expect(r.errors).toHaveProperty("email");
    expect(r.errors).toHaveProperty("phone");
  });
});
