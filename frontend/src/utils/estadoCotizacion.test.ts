import { estadoAlGuardar } from "./estadoCotizacion";
import { describe, expect, it } from "vitest";
import {
  ESTADOS_COTIZACION,
  chipEstado,
  etiquetaConEmoji,
  etiquetaEstado,
  hexEstado,
  puntoEstado,
} from "./estadoCotizacion";

// LAS DECISIONES DE FELIPE, CON CANDADO.
//
// Este diccionario nació porque lo mismo estaba escrito seis veces y las
// copias no coincidían. Estas pruebas existen para que las decisiones no
// se pierdan otra vez.

describe("La palabra oficial es ANULADA", () => {
  it("el estado técnico 'cancelada' se muestra como Anulada", () => {
    // Coronada por Felipe el 12-08. Tres pantallas siguieron diciendo
    // "Cancelada" durante dos días porque cada una tenía su copia.
    expect(etiquetaEstado("cancelada")).toBe("Anulada");
  });

  it("en ninguna parte del diccionario dice Cancelada", () => {
    const todas = ESTADOS_COTIZACION.map(etiquetaEstado).join(" ");
    expect(todas).not.toContain("Cancelada");
  });
});

describe("Cada estado tiene sus cinco formas, y son coherentes", () => {
  it("los siete estados están definidos", () => {
    expect(ESTADOS_COTIZACION).toHaveLength(7);
  });

  it.each([...ESTADOS_COTIZACION])("%s tiene nombre, chip, punto y color", (e) => {
    expect(etiquetaEstado(e).length).toBeGreaterThan(0);
    expect(chipEstado(e)).toMatch(/^bg-[a-z]+-\d{3} text-[a-z]+-\d{3}$/);
    expect(puntoEstado(e)).toMatch(/^bg-[a-z]+-\d{3}$/);
    expect(hexEstado(e)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("REALIZADA es UN SOLO verde, no cinco", () => {
    // Antes tenía cinco tonos distintos según la pantalla.
    expect(chipEstado("realizada")).toBe("bg-emerald-100 text-emerald-800");
    expect(puntoEstado("realizada")).toBe("bg-emerald-500");
    expect(hexEstado("realizada")).toBe("#10b981");
  });

  it("dos estados distintos nunca comparten color", () => {
    const hexes = ESTADOS_COTIZACION.map(hexEstado);
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});

describe("El ciclo de vida manda el orden", () => {
  it("se pide, se envía, se negocia, se gana, se realiza; y al final lo perdido", () => {
    expect([...ESTADOS_COTIZACION]).toEqual([
      "solicitada",
      "enviada",
      "en_negociacion",
      "aceptada",
      "realizada",
      "rechazada",
      "cancelada",
    ]);
  });
});

describe("Un estado desconocido no rompe la pantalla", () => {
  it("muestra el valor crudo en vez de una casilla vacía", () => {
    expect(etiquetaEstado("inventado")).toBe("inventado");
  });

  it("cae a un gris de reserva, no a vacío", () => {
    expect(chipEstado("inventado")).toContain("bg-gray");
    expect(hexEstado("inventado")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("La etiqueta con emoji", () => {
  it("pone el emoji delante", () => {
    expect(etiquetaConEmoji("cancelada")).toBe("🚫 Anulada");
    expect(etiquetaConEmoji("aceptada")).toBe("✅ Aceptada");
  });

  it("sin emoji conocido, no deja un espacio suelto adelante", () => {
    expect(etiquetaConEmoji("inventado")).toBe("inventado");
  });
});

describe("estadoAlGuardar (Felipe, 18-08): nadie fuerza 'enviada'", () => {
  it("desde un requerimiento se guarda con el estado del formulario, no enviada", () => {
    expect(estadoAlGuardar("solicitada", true)).toBe("solicitada");
  });
  it("desde cero, igual", () => {
    expect(estadoAlGuardar("solicitada", false)).toBe("solicitada");
  });
  it("si la persona ya la puso en enviada, se respeta: es ella quien envía", () => {
    expect(estadoAlGuardar("enviada", true)).toBe("enviada");
    expect(estadoAlGuardar("en_negociacion", false)).toBe("en_negociacion");
  });
});
