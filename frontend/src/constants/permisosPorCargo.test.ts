import { describe, expect, it } from "vitest";
import { puedeCambiarContacto } from "../utils/puedeCambiarContacto";
import {
  PERMISOS_DE_FABRICA,
  ROLE_PERMISSIONS,
  SECTION_PERMISO,
  SECTION_ROLES,
  Section,
  UserRole,
  canAccessSection,
  permisosDe,
  puedeEntrar,
} from "./permissions";

// LOS PERMISOS POR CARGO EN LA APP (doc 22, 05-11-2026). El menú y las
// rutas preguntan lo mismo: el permiso de la sección, con la lista que
// manda el motor en el perfil. Con todo de fábrica, nadie gana ni pierde
// nada; la única diferencia es la que decidió Felipe: el vendedor ve el
// Calendario en el menú (antes entraba solo por «Ver en calendario»).

const CARGOS: UserRole[] = [
  "recepcion",
  "vendedor",
  "operaciones",
  "administrador",
];
const conPermiso = Object.keys(SECTION_PERMISO) as Section[];

describe("permisos por cargo: lo de fábrica", () => {
  it("las rutas, igual que antes para los cuatro cargos", () => {
    for (const c of CARGOS)
      for (const s of conPermiso)
        expect([c, s, puedeEntrar(c, s)]).toEqual([
          c,
          s,
          SECTION_ROLES[s].includes(c),
        ]);
  });

  it("el menú, igual que antes salvo el Calendario del vendedor", () => {
    for (const c of CARGOS)
      for (const s of conPermiso) {
        const antes = ROLE_PERMISSIONS[c].includes(s);
        const ahora = canAccessSection(c, s);
        if (c === "vendedor" && s === "calendar") {
          expect([antes, ahora]).toEqual([false, true]);
        } else {
          expect([c, s, ahora]).toEqual([c, s, antes]);
        }
      }
  });

  it("sin la lista del motor, los de fábrica del cargo; sin cargo, ninguno", () => {
    expect(permisosDe("vendedor", undefined)).toEqual(
      PERMISOS_DE_FABRICA.vendedor,
    );
    expect(permisosDe("vendedor", null)).toEqual(PERMISOS_DE_FABRICA.vendedor);
    expect(permisosDe("vendedor", ["clientes"])).toEqual(["clientes"]);
    expect(permisosDe(null, undefined)).toEqual([]);
  });
});

describe("permisos por cargo: lo que cambia la empresa", () => {
  const recepcionSinCotizaciones = PERMISOS_DE_FABRICA.recepcion.filter(
    (p) => p !== "cotizaciones",
  );

  it("apagado: ni en el menú ni por la ruta, ni el cotizador", () => {
    for (const s of ["quotations", "quotations_edit"] as Section[]) {
      expect(canAccessSection("recepcion", s, recepcionSinCotizaciones)).toBe(
        false,
      );
      expect(puedeEntrar("recepcion", s, recepcionSinCotizaciones)).toBe(false);
    }
    expect(
      puedeCambiarContacto("recepcion", "enviada", recepcionSinCotizaciones),
    ).toBe(false);
  });

  it("prendido: aparece y la ruta deja entrar", () => {
    const conClientes = [...PERMISOS_DE_FABRICA.recepcion, "clientes" as const];
    expect(canAccessSection("recepcion", "clients", conClientes)).toBe(true);
    expect(puedeEntrar("recepcion", "clients", conClientes)).toBe(true);
  });

  it("Mi cuenta y Planes no tienen interruptor: siguen como estaban", () => {
    expect(canAccessSection("recepcion", "configuration", [])).toBe(true);
    expect(puedeEntrar("recepcion", "plans", [])).toBe(true);
    expect(canAccessSection("recepcion", "plans", [])).toBe(false);
  });
});
