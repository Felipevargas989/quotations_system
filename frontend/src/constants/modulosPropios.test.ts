import { describe, expect, it } from "vitest";
import { SECTION_MODULO, tieneModulo } from "./permissions";

// MÓDULOS PROPIOS (14-09-2026): Personal y Marketing solo para la empresa
// que los tiene encendidos. Todo lo demás no pide módulo.
describe("tieneModulo", () => {
  it("una sección sin módulo propio siempre pasa", () => {
    expect(tieneModulo({ modulos_propios: [] }, undefined)).toBe(true);
    expect(tieneModulo(null, SECTION_MODULO.quotations)).toBe(true);
  });
  it("Personal y Marketing exigen el módulo encendido", () => {
    expect(tieneModulo({ modulos_propios: ["personal", "marketing"] }, "personal")).toBe(true);
    expect(tieneModulo({ modulos_propios: ["personal"] }, "marketing")).toBe(false);
    expect(tieneModulo({ modulos_propios: null }, "personal")).toBe(false);
    expect(tieneModulo(null, "personal")).toBe(false);
  });
  it("las dos secciones propias son exactamente Personal y Marketing", () => {
    expect(SECTION_MODULO).toEqual({ people: "personal", marketing: "marketing" });
  });
});
