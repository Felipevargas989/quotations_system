import { describe, expect, it } from "vitest";
import {
  borradorDeFacturacion,
  cambiosDeFacturacion,
  correosDe,
  problemaDeCorreos,
} from "./datosDeFacturacion";

// LA TARJETA «DATOS DE FACTURACIÓN» (migración 184): solo viaja lo que
// cambió, y los correos se revisan uno por uno antes de guardar.
const ccu = {
  id: "c-1",
  rut: "90413000-1",
  razon_social: "Compañía Cervecerías Unidas S.A.",
  giro: null,
  correo_facturacion: "facturas@ccu.cl",
  referencias_exigidas: ["801", "802"],
};

describe("Lo que viaja al guardar", () => {
  it("sin tocar nada, no viaja nada", () => {
    expect(cambiosDeFacturacion(ccu, borradorDeFacturacion(ccu))).toEqual({});
  });

  it("solo lo que cambió, sin espacios de sobra", () => {
    const borrador = { ...borradorDeFacturacion(ccu), giro: "  Cervecería " };
    expect(cambiosDeFacturacion(ccu, borrador)).toEqual({ giro: "Cervecería" });
  });

  it("una casilla vaciada viaja vacía (el motor la deja en null)", () => {
    const borrador = { ...borradorDeFacturacion(ccu), rut: "" };
    expect(cambiosDeFacturacion(ccu, borrador)).toEqual({ rut: "" });
  });

  it("las referencias en otro orden no son un cambio", () => {
    const borrador = {
      ...borradorDeFacturacion(ccu),
      referencias_exigidas: ["802", "801"],
    };
    expect(cambiosDeFacturacion(ccu, borrador)).toEqual({});
  });

  it("quitar una referencia sí lo es", () => {
    const borrador = {
      ...borradorDeFacturacion(ccu),
      referencias_exigidas: ["801"],
    };
    expect(cambiosDeFacturacion(ccu, borrador)).toEqual({
      referencias_exigidas: ["801"],
    });
  });
});

describe("Los correos para la factura", () => {
  it("se separan por coma, punto y coma o espacio", () => {
    expect(correosDe("a@ccu.cl, b@ccu.cl;c@ccu.cl d@ccu.cl")).toEqual([
      "a@ccu.cl",
      "b@ccu.cl",
      "c@ccu.cl",
      "d@ccu.cl",
    ]);
  });

  it("dice cuál es el que no sirve", () => {
    expect(problemaDeCorreos("facturas@ccu.cl, pagos@ccu")).toBe(
      "«pagos@ccu» no parece un correo válido.",
    );
    expect(problemaDeCorreos("facturas@ccu.cl, pagos@ccu.cl")).toBeNull();
    expect(problemaDeCorreos("")).toBeNull();
  });
});
