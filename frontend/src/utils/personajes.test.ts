import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COLORES_PERSONALES,
  PERSONAJES,
  aparienciaDeAutor,
  colorAutomatico,
  colorValido,
  imagenDePersonaje,
  nombreDeAutor,
  type Apariencia,
} from "./personajes";

/**
 * EL PERSONAJE Y EL COLOR DE CADA UNO (Felipe, 27-10-2026; migración 167).
 * La lista vive solo en la app: estas pruebas cuidan que cada clave tenga
 * su imagen y que la base acepte lo que la pantalla guarda.
 */
describe("la lista de personajes", () => {
  it("cada clave tiene la forma que exige la base y no se repite", () => {
    const claves = PERSONAJES.map((p) => p.clave);
    for (const c of claves) expect(c).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("cada personaje tiene su imagen en public/personajes", () => {
    for (const { clave } of PERSONAJES)
      expect(
        existsSync(
          new URL(`../../public/personajes/${clave}.png`, import.meta.url),
        ),
      ).toBe(true);
  });

  it("cada color tiene la forma #rrggbb y no se repite", () => {
    const hex = COLORES_PERSONALES.map((c) => c.hex);
    for (const h of hex) expect(h).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(hex).size).toBe(hex.length);
  });
});

describe("imagenDePersonaje y colorValido", () => {
  it("una clave de la lista da su imagen; cualquier otra, nada", () => {
    expect(imagenDePersonaje("zorro")).toBe("/personajes/zorro.png");
    expect(imagenDePersonaje("osito")).toBeNull();
    expect(imagenDePersonaje(null)).toBeNull();
  });

  it("solo pasa un #rrggbb", () => {
    expect(colorValido("#059669")).toBe("#059669");
    expect(colorValido("verde")).toBeNull();
    expect(colorValido(undefined)).toBeNull();
  });
});

describe("colorAutomatico y nombreDeAutor (los de siempre)", () => {
  // La cuenta exacta que vivía en SeguimientoPanel hasta el 27-10-2026:
  // nadie que no elija color debe ver el suyo cambiado.
  const PALETA_DE_ANTES = [
    "#2563eb",
    "#7c3aed",
    "#059669",
    "#d97706",
    "#dc2626",
    "#0891b2",
    "#db2777",
    "#4f46e5",
  ];
  const colorDeAntes = (nombre: string) => {
    let h = 0;
    for (let i = 0; i < nombre.length; i++)
      h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
    return PALETA_DE_ANTES[h % PALETA_DE_ANTES.length];
  };

  it("cada nombre conserva el color que tenía", () => {
    for (const n of [
      "Felipe",
      "Camila",
      "Asistente",
      "Recepción",
      "—",
      "Ñandú",
    ])
      expect(colorAutomatico(n)).toBe(colorDeAntes(n));
  });

  it("un correo se muestra como su nombre, con mayúscula", () => {
    expect(nombreDeAutor("camila@valledelsolquillon.cl")).toBe("Camila");
    expect(nombreDeAutor("  Felipe Vargas ")).toBe("Felipe Vargas");
    expect(nombreDeAutor(null)).toBe("—");
  });
});

describe("aparienciaDeAutor", () => {
  const apariencias = new Map<string, Apariencia>([
    ["a-1", { user_id: "a-1", personaje: "zorro", color: "#059669" }],
    ["a-2", { user_id: "a-2", personaje: null, color: null }],
    ["a-3", { user_id: "a-3", personaje: "osito", color: "rojo" }],
  ]);

  it("la nota de alguien muestra lo que eligió en Mi cuenta", () => {
    expect(aparienciaDeAutor("a-1", "Felipe", apariencias)).toEqual({
      personaje: "zorro",
      color: "#059669",
    });
  });

  it("si no eligió, la nota se ve como antes", () => {
    expect(aparienciaDeAutor("a-2", "Camila", apariencias)).toEqual({
      personaje: null,
      color: null,
    });
  });

  it("una clave o un color que ya no sirven no se muestran", () => {
    expect(aparienciaDeAutor("a-3", "Ana", apariencias)).toEqual({
      personaje: null,
      color: null,
    });
  });

  it("el Asistente lleva su robot", () => {
    expect(aparienciaDeAutor(null, "Asistente", apariencias)).toEqual({
      personaje: "robot",
      color: null,
    });
  });

  it("una nota antigua sin persona no lleva nada", () => {
    expect(
      aparienciaDeAutor(null, "felipe@valledelsol.cl", apariencias),
    ).toEqual({ personaje: null, color: null });
  });
});
