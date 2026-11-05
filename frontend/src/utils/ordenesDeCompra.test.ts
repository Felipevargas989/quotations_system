import { describe, expect, it } from "vitest";
import {
  borradorDeLaLectura,
  borradorDeOC,
  cambiosDeOC,
  faltaEnLaOC,
  fechaCorta,
} from "./ordenesDeCompra";
import type { OrdenDeCompra } from "../services/ordenesDeCompra.service";

// LAS ÓRDENES DE COMPRA DE LA PESTAÑA «FACTURACIÓN» (doc 19, paso 2a). El
// caso es la OC 3 de 3 de Santo Tomás (evento #481): del Instituto
// Profesional, N° 32000066941, del 14-10-2026.
const oc3: OrdenDeCompra = {
  id: 3,
  quotation_id: "ev-481",
  numero: "32000066941",
  fecha: "2026-10-14",
  rut: "65175239-6",
  razon_social: "Corporación Instituto Profesional Santo Tomás",
  descripcion: null,
  neto: null,
  iva: null,
  total: 2619929,
  origen: "manual",
  documento_id: 261,
  created_at: "2026-11-04T21:00:00Z",
};

describe("Lo que falta para guardar una OC", () => {
  it("una vacía pide el N°, la fecha y el total", () => {
    expect(faltaEnLaOC(borradorDeOC())).toEqual([
      "el N°",
      "la fecha",
      "el total",
    ]);
  });

  it("el RUT es opcional, pero si va tiene que ser válido", () => {
    expect(faltaEnLaOC(borradorDeOC(oc3))).toEqual([]);
    expect(faltaEnLaOC({ ...borradorDeOC(oc3), rut: "65175239-5" })).toEqual([
      "un RUT válido",
    ]);
  });
});

describe("Lo que viaja al guardar una OC", () => {
  it("al agregar viaja todo, con el RUT limpio y el PDF como número", () => {
    const b = { ...borradorDeOC(), ...borradorDeOC(oc3), rut: "65.175.239-6" };
    expect(cambiosDeOC(null, b)).toEqual({
      numero: "32000066941",
      fecha: "2026-10-14",
      rut: "65175239-6",
      razon_social: "Corporación Instituto Profesional Santo Tomás",
      descripcion: null,
      neto: null,
      iva: null,
      total: 2619929,
      documento_id: 261,
    });
  });

  it("al editar sin tocar nada, no viaja nada", () => {
    expect(cambiosDeOC(oc3, borradorDeOC(oc3))).toEqual({});
  });

  it("al editar, solo lo que cambió (el neto y el IVA de la OC)", () => {
    const b = { ...borradorDeOC(oc3), neto: 2201621, iva: 418308 };
    expect(cambiosDeOC(oc3, b)).toEqual({ neto: 2201621, iva: 418308 });
  });

  it("sacar el PDF viaja como null", () => {
    expect(
      cambiosDeOC(oc3, { ...borradorDeOC(oc3), documento_id: "" }),
    ).toEqual({ documento_id: null });
  });
});

it("la fecha se muestra sin correrse un día", () => {
  expect(fechaCorta("2026-10-14")).toBe("14-10-2026");
});

describe("Lo que leyó BelIA llena el formulario (paso 2b)", () => {
  const propuesta = {
    numero: "32000066941",
    fecha: "2026-10-14",
    rut: "65175239-6",
    razon_social: "Corporación Instituto Profesional Santo Tomás",
    descripcion: "Fiesta de Navidad Santo Tomás 2026",
    neto: null,
    iva: null,
    total: 4405023,
    giro: null,
    direccion: null,
    comuna: null,
    ciudad: null,
    otras_referencias: [],
  };

  it("con el PDF de Documentos y el origen «pdf»", () => {
    const b = borradorDeLaLectura(propuesta, 261);
    expect(b).toMatchObject({
      numero: "32000066941",
      rut: "65175239-6",
      total: 4405023,
      documento_id: "261",
      origen: "pdf",
    });
    expect(faltaEnLaOC(b)).toEqual([]);
    expect(cambiosDeOC(null, b)).toMatchObject({ origen: "pdf" });
  });

  it("lo que no leyó queda vacío y se pide", () => {
    const b = borradorDeLaLectura(
      { ...propuesta, fecha: null, total: null },
      261,
    );
    expect(faltaEnLaOC(b)).toEqual(["la fecha", "el total"]);
  });
});
