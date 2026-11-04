import { describe, expect, it } from "vitest";
import {
  borradorDeRazonSocial,
  cambiosDeRazonSocial,
  correosDe,
  problemaDeCorreos,
} from "./datosDeFacturacion";
import type { RazonSocial } from "../services/razonesSociales.service";

// LAS RAZONES SOCIALES DE LA FICHA (migración 184, doc 19 §9.12): al editar
// solo viaja lo que cambió; al agregar viaja todo; los correos se revisan
// uno por uno. El caso es Santo Tomás: el evento #481 factura al CFT y al
// Instituto Profesional.
const cft: RazonSocial = {
  id: 7,
  client_id: "santo-tomas",
  rut: "65175242-6",
  razon_social: "Corporación Centro de Formación Técnica Santo Tomás",
  giro: "Educación",
  direccion: "Av. Carlos Schorr 255",
  comuna: "Talca",
  ciudad: "Talca",
  correo_facturacion: null,
  referencias_exigidas: ["801"],
  origen: "manual",
  created_at: "2026-11-04T20:00:00Z",
};

describe("Lo que viaja al guardar una razón social", () => {
  it("al agregar, viaja todo", () => {
    const borrador = {
      ...borradorDeRazonSocial(),
      rut: "65175239-6",
      razon_social: "Corporación Instituto Profesional Santo Tomás",
    };
    expect(cambiosDeRazonSocial(null, borrador)).toEqual({
      rut: "65175239-6",
      razon_social: "Corporación Instituto Profesional Santo Tomás",
      giro: "",
      direccion: "",
      comuna: "",
      ciudad: "",
      correo_facturacion: "",
      referencias_exigidas: [],
    });
  });

  it("al editar sin tocar nada, no viaja nada", () => {
    expect(cambiosDeRazonSocial(cft, borradorDeRazonSocial(cft))).toEqual({});
  });

  it("al editar, solo lo que cambió y sin espacios de sobra", () => {
    const borrador = { ...borradorDeRazonSocial(cft), giro: "  Enseñanza " };
    expect(cambiosDeRazonSocial(cft, borrador)).toEqual({ giro: "Enseñanza" });
  });

  it("las referencias en otro orden no son un cambio; sumar una sí", () => {
    const mismo = {
      ...borradorDeRazonSocial({
        ...cft,
        referencias_exigidas: ["801", "802"],
      }),
      referencias_exigidas: ["802", "801"],
    };
    expect(
      cambiosDeRazonSocial(
        { ...cft, referencias_exigidas: ["801", "802"] },
        mismo,
      ),
    ).toEqual({});
    const otra = {
      ...borradorDeRazonSocial(cft),
      referencias_exigidas: ["801", "HES"],
    };
    expect(cambiosDeRazonSocial(cft, otra)).toEqual({
      referencias_exigidas: ["801", "HES"],
    });
  });
});

describe("Los correos para la factura", () => {
  it("se separan por coma, punto y coma o espacio", () => {
    expect(correosDe("a@st.cl, b@st.cl;c@st.cl d@st.cl")).toEqual([
      "a@st.cl",
      "b@st.cl",
      "c@st.cl",
      "d@st.cl",
    ]);
  });

  it("dice cuál es el que no sirve", () => {
    expect(problemaDeCorreos("facturas@santotomas.cl, pagos@santotomas")).toBe(
      "«pagos@santotomas» no parece un correo válido.",
    );
    expect(problemaDeCorreos("facturas@santotomas.cl")).toBeNull();
    expect(problemaDeCorreos("")).toBeNull();
  });
});
