import { describe, expect, it } from "vitest";
import {
  Derecho,
  PLAN_MINIMO,
  SECTION_DERECHO,
  estaBloqueada,
  tieneDerecho,
} from "./permissions";

// LOS DERECHOS POR PLAN EN LA APP (14-09-2026, paso 3.2 del roadmap).
//
// Empezó el 14-09 como "módulos propios" (Personal y Marketing solo para
// Valle del Sol); ahora es el mismo mecanismo con todos los derechos de
// los tres planes. La app NO tiene copia de la tabla de planes: el motor
// le manda la lista hecha en el perfil.
describe("tieneDerecho", () => {
  it("una sección sin derecho siempre pasa", () => {
    expect(tieneDerecho({ derechos: [] }, undefined)).toBe(true);
    expect(tieneDerecho(null, SECTION_DERECHO.quotations)).toBe(true);
  });

  it("pide el derecho exacto que trae la empresa", () => {
    expect(tieneDerecho({ derechos: ["base", "calendario"] }, "calendario")).toBe(true);
    expect(tieneDerecho({ derechos: ["base"] }, "calendario")).toBe(false);
    expect(tieneDerecho({ derechos: null }, "post_venta")).toBe(false);
    expect(tieneDerecho(null, "post_venta")).toBe(false);
  });

  it("Personal y Marketing siguen siendo derechos como los demás", () => {
    expect(tieneDerecho({ derechos: ["personal", "marketing"] }, "personal")).toBe(true);
    expect(tieneDerecho({ derechos: ["personal"] }, "marketing")).toBe(false);
  });

  it("las secciones con candado son las seis que corresponden", () => {
    expect(SECTION_DERECHO).toEqual({
      payments: "post_venta",
      logistics: "logistica",
      calendar: "calendario",
      customer_satisfaction_survey: "encuestas",
      people: "personal",
      marketing: "marketing",
    });
  });

  it("las secciones del plan más barato no llevan candado", () => {
    // Cotiza vende requerimientos, cotizador, catálogo, clientes,
    // Dashboard nivel 1 y Configuración: ninguna puede quedar cerrada.
    for (const seccion of [
      "dashboard",
      "requests",
      "quotations",
      "quotations_edit",
      "clients",
      "services",
      "configuration",
      "plans",
    ] as const) {
      expect(SECTION_DERECHO[seccion]).toBeUndefined();
    }
  });
});

describe("estaBloqueada", () => {
  it("solo cuando se le acabó la prueba sin contratar", () => {
    expect(estaBloqueada({ estado_plan: "bloqueado" })).toBe(true);
    expect(estaBloqueada({ estado_plan: "activo" })).toBe(false);
    expect(estaBloqueada({ estado_plan: "prueba" })).toBe(false);
    expect(estaBloqueada({ estado_plan: "moroso" })).toBe(false);
    expect(estaBloqueada(null)).toBe(false);
  });
});

describe("a qué plan hay que subirse", () => {
  it("cada derecho que se vende nombra su plan", () => {
    expect(PLAN_MINIMO.calendario).toBe("gestiona");
    expect(PLAN_MINIMO.post_venta).toBe("gestiona");
    expect(PLAN_MINIMO.varios_dias).toBe("gestiona");
    expect(PLAN_MINIMO.logistica).toBe("crece");
    expect(PLAN_MINIMO.dashboard_3).toBe("crece");
  });

  it("los dos módulos propios no se venden: no ofrecen mejora", () => {
    expect(PLAN_MINIMO.personal).toBeNull();
    expect(PLAN_MINIMO.marketing).toBeNull();
  });

  it("todo derecho del menú tiene su plan definido", () => {
    for (const derecho of Object.values(SECTION_DERECHO) as Derecho[]) {
      expect(PLAN_MINIMO).toHaveProperty(derecho);
    }
  });
});
