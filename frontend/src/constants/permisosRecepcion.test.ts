import { describe, expect, it } from "vitest";
import {
  ROLE_PERMISSIONS,
  SECTION_ROLES,
  canAccessSection,
} from "./permissions";

/**
 * RECEPCIÓN SOLO VE REQUERIMIENTOS Y CALENDARIO (Felipe, 03-10-2026:
 * "requerimiento y calendario, pero no más que eso"). Este archivo tiene
 * dos listas: ROLE_PERMISSIONS (el menú lateral) y SECTION_ROLES (las
 * rutas). El primer intento cambió solo la segunda y el menú siguió
 * ofreciendo Cotizaciones, Consultas y Clientes, que la ruta rebotaba.
 * Esta prueba amarra las dos para recepción.
 */
describe("lo que ve recepción", () => {
  const secciones = Object.keys(
    SECTION_ROLES,
  ) as (keyof typeof SECTION_ROLES)[];

  it("el menú y las rutas dicen lo mismo", () => {
    // "plans" no tiene entrada en el menú: es la pantalla a la que la app
    // lleva a todos cuando el plan está bloqueado, así que su ruta queda
    // abierta a todos los cargos aunque el menú no la nombre.
    for (const s of secciones.filter((x) => x !== "plans")) {
      expect([s, canAccessSection("recepcion", s)]).toEqual([
        s,
        SECTION_ROLES[s].includes("recepcion"),
      ]);
    }
  });

  it("solo Requerimientos, Calendario y su propia cuenta", () => {
    expect([...ROLE_PERMISSIONS.recepcion].sort()).toEqual(
      ["calendar", "configuration", "requests"].sort(),
    );
  });
});
