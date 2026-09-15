import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Derecho, SECTION_DERECHO } from "../constants/permissions";

/**
 * QUE NINGÚN ÍTEM DEL MENÚ QUEDE SIN SU CANDADO (15-09-2026).
 *
 * Nació de un error real. El 15-09 Felipe, probando en el laboratorio:
 * "el módulo de consulta sigue abierto, me arrojó error ahí". Consultas
 * COMPARTE la sección `quotations` con el cotizador —el cargo que las
 * abre es el mismo— pero no comparte el plan: el embudo con brochure
 * entra con Opera y Crece. Como el mapa de candados solo sabía de
 * secciones, el menú la ofrecía y el motor la negaba: el cliente veía un
 * error en vez de la invitación a mejorar de plan.
 *
 * Esta prueba lee el Sidebar y App.tsx DE VERDAD, no una copia, y exige
 * que cada pantalla que el motor cierra tenga su candado también acá. No
 * es seguridad —el motor niega igual— es que nadie choque contra una
 * puerta que no debió ofrecérsele.
 */

const leer = (ruta: string) =>
  readFileSync(new URL(ruta, import.meta.url), "utf8");

const sidebar = leer("./Sidebar.tsx");
const app = leer("../App.tsx");

// Los derechos que SÍ tienen una pantalla en esta app. Los que faltan de
// esta lista, con su razón:
//   base                → es lo que trae cualquier plan
//   portal              → lo abre el cliente por su enlace, no hay menú
//   correos_automaticos → son relojes del motor, no una pantalla
//   movil               → Eventia Móvil es otra aplicación
//   varios_dias         → un campo del cotizador (CampoUltimoDia)
//   clientes_360        → un panel dentro de Clientes
//   gestion_y_cocina    → dos pestañas dentro de Post-Venta
//   dashboard_2 y _3    → zonas dentro del Dashboard
const CON_PANTALLA_PROPIA: Derecho[] = [
  "post_venta",
  "logistica",
  "calendario",
  "encuestas",
  "consultas",
  "personal",
  "marketing",
];

describe("el menú y las rutas llevan el candado del plan", () => {
  for (const derecho of CON_PANTALLA_PROPIA) {
    it(`"${derecho}" está en el menú con su candado`, () => {
      const porSeccion = Object.values(SECTION_DERECHO).includes(derecho);
      const porItem = sidebar.includes(`derecho: "${derecho}"`);
      expect(porSeccion || porItem).toBe(true);
    });

    it(`"${derecho}" cierra también su ruta`, () => {
      expect(app).toContain(`derecho="${derecho}"`);
    });
  }

  it("el candado del menú mira primero el derecho propio del ítem", () => {
    // Si esto se pierde, Consultas vuelve a quedar abierta: su sección es
    // la del cotizador, que no lleva candado.
    expect(sidebar).toContain('"derecho" in item ? item.derecho : undefined');
  });

  it("las secciones del plan más barato no llevan candado", () => {
    for (const seccion of [
      "dashboard",
      "requests",
      "quotations",
      "clients",
      "services",
      "configuration",
      "plans",
    ] as const) {
      expect(SECTION_DERECHO[seccion]).toBeUndefined();
    }
  });
});
