import { describe, expect, it } from "vitest";
import { esCambioDeEstado, pasoAEnviada } from "./cambioDeEstado";

// El cambio de estado en el Seguimiento (Felipe, 09-11-2026): la línea que
// escribe el motor, firmada por quien movió la cotización.

describe("cambio de estado en el Seguimiento", () => {
  it("se reconoce por su tipo, no por el texto", () => {
    expect(esCambioDeEstado({ tipo: "estado" })).toBe(true);
    expect(esCambioDeEstado({ tipo: "otro" })).toBe(false);
    expect(esCambioDeEstado({ tipo: null })).toBe(false);
  });

  it("sabe si alguien la movió a Enviada (para no repetir la línea gris)", () => {
    const aEnviada = {
      tipo: "estado",
      note: "Cambió el estado de Solicitada a Enviada.",
    };
    const deEnviada = {
      tipo: "estado",
      note: "Cambió el estado de Enviada a En Negociación.",
    };
    const unaNota = { tipo: "otro", note: "Quedó en pasar a Enviada." };
    expect(pasoAEnviada([aEnviada])).toBe(true);
    expect(pasoAEnviada([deEnviada])).toBe(false);
    expect(pasoAEnviada([unaNota])).toBe(false);
    expect(pasoAEnviada([])).toBe(false);
  });
});
