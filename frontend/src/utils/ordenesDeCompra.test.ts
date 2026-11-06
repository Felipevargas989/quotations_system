import { describe, expect, it } from "vitest";
import { fechaCorta } from "./ordenesDeCompra";

describe("Las fechas de facturación", () => {
  it("«2026-10-14» se lee 14-10-2026, sin correrse un día", () => {
    expect(fechaCorta("2026-10-14")).toBe("14-10-2026");
  });

  it("lo que no es una fecha queda como vino", () => {
    expect(fechaCorta("")).toBe("");
  });
});
