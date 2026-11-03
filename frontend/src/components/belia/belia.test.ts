import { describe, expect, it } from "vitest";
import {
  UMBRAL_DE_ENOJO,
  animoDe,
  bloquesDe,
  hayAlgoNuevo,
  pantallaDe,
  trozosDe,
} from "./belia";

// La ventanilla de BelIA sin pantalla (doc 20 §8 y §8b).

const ID = "2c3120f3-0d44-4c33-8486-a8a1d9c69aca";

describe("pantallaDe", () => {
  it("reconoce la cotización abierta en sus tres pantallas", () => {
    for (const ruta of [
      `/post-venta/${ID}`,
      `/negocio/${ID}`,
      `/quotation-form/${ID}`,
    ]) {
      expect(pantallaDe(ruta)).toEqual({ ruta, cotizacion_id: ID });
    }
  });
  it("en las demás pantallas viaja solo la ruta", () => {
    expect(pantallaDe("/quotations")).toEqual({ ruta: "/quotations" });
    expect(pantallaDe(`/clients/${ID}`)).toEqual({ ruta: `/clients/${ID}` });
  });
});

describe("animoDe", () => {
  const base = {
    pensando: false,
    celebrando: false,
    avisando: false,
    dormida: false,
    vencidos: 0,
  };
  it("lo que pasa ahora manda sobre el humor de fondo", () => {
    expect(animoDe({ ...base, pensando: true, celebrando: true })).toBe(
      "pensando",
    );
    expect(animoDe({ ...base, celebrando: true, avisando: true })).toBe(
      "celebra",
    );
    expect(animoDe({ ...base, avisando: true, dormida: true })).toBe(
      "atencion",
    );
  });
  it("se enoja pasado el umbral, pero dormida descansa", () => {
    expect(animoDe({ ...base, vencidos: UMBRAL_DE_ENOJO })).toBe("espera");
    expect(animoDe({ ...base, vencidos: UMBRAL_DE_ENOJO + 1 })).toBe("enojada");
    expect(animoDe({ ...base, vencidos: 50, dormida: true })).toBe("dormida");
  });
});

describe("hayAlgoNuevo", () => {
  const e = (vencen_hoy: number, requerimientos_de_hoy: number) => ({
    vencidos: 0,
    sin_gestion: 0,
    vencen_hoy,
    requerimientos_de_hoy,
  });
  it("solo cuando sube lo de hoy", () => {
    expect(hayAlgoNuevo(e(1, 0), undefined)).toBe(true);
    expect(hayAlgoNuevo(e(1, 0), e(1, 0))).toBe(false);
    expect(hayAlgoNuevo(e(1, 2), e(1, 1))).toBe(true);
    expect(hayAlgoNuevo(e(0, 0), e(2, 0))).toBe(false);
  });
});

describe("lo que contesta BelIA", () => {
  it("enlaza solo las rutas de Eventia", () => {
    expect(
      trozosDe(
        "Abre la [N° 500](/negocio/abc) y **revisa** [esto](https://x.com).",
      ),
    ).toEqual([
      { tipo: "texto", texto: "Abre la " },
      { tipo: "enlace", texto: "N° 500", ruta: "/negocio/abc" },
      { tipo: "texto", texto: " y " },
      { tipo: "negrita", trozos: [{ tipo: "texto", texto: "revisa" }] },
      { tipo: "texto", texto: " " },
      { tipo: "texto", texto: "esto" },
      { tipo: "texto", texto: "." },
    ]);
  });
  it("enlaza también dentro de una negrita (la 436 del laboratorio, 03-11)", () => {
    expect(trozosDe("**[N° 436](/post-venta/abc) · Aerobica**")).toEqual([
      {
        tipo: "negrita",
        trozos: [
          { tipo: "enlace", texto: "N° 436", ruta: "/post-venta/abc" },
          { tipo: "texto", texto: " · Aerobica" },
        ],
      },
    ]);
  });
  it("arma tablas, listas y párrafos", () => {
    const b = bloquesDe(
      "Tienes **41**:\n\n| N° | Total |\n|---|---|\n| [N° 437](/negocio/x) | $2.113.000 |\n\n- uno\n- dos",
    );
    expect(b.map((x) => x.tipo)).toEqual(["parrafo", "tabla", "lista"]);
    const tabla = b[1];
    if (tabla.tipo !== "tabla") throw new Error("no es tabla");
    expect(tabla.filas).toHaveLength(1);
    expect(tabla.filas[0][0]).toEqual([
      { tipo: "enlace", texto: "N° 437", ruta: "/negocio/x" },
    ]);
  });
});
