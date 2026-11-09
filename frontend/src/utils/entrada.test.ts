import { describe, expect, it } from "vitest";
import { destinoAlEntrar, haySesionGuardada } from "./entrada";

/** LA PUERTA DE EVENTIA (Felipe, 09-11-2026). */
const almacen = (llaves: string[]) => ({
  length: llaves.length,
  key: (i: number) => llaves[i] ?? null,
});

describe("destinoAlEntrar", () => {
  it("el administrador va al Dashboard", () => {
    expect(destinoAlEntrar("administrador")).toBe("/dashboard");
  });
  it("los demás cargos, y el cargo que no llegó, van a Requerimientos", () => {
    for (const rol of ["vendedor", "recepcion", "operaciones", null, undefined])
      expect(destinoAlEntrar(rol)).toBe("/requests");
  });
});

describe("haySesionGuardada", () => {
  it("reconoce la llave donde Supabase guarda la sesión", () => {
    expect(
      haySesionGuardada(
        almacen(["eventia_personal_pestana", "sb-abcdefgh-auth-token"]),
      ),
    ).toBe(true);
  });
  it("sin esa llave no hay sesión, aunque haya otras cosas guardadas", () => {
    expect(
      haySesionGuardada(almacen(["eventia_profile_123", "planta-proyectada"])),
    ).toBe(false);
    expect(haySesionGuardada(almacen([]))).toBe(false);
    expect(haySesionGuardada(null)).toBe(false);
  });
  it("si el navegador no deja leer lo guardado, es como no tener sesión", () => {
    const roto = {
      get length(): number {
        throw new Error("bloqueado");
      },
      key: () => null,
    };
    expect(haySesionGuardada(roto)).toBe(false);
  });
});
