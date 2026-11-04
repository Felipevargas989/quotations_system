import { describe, expect, it } from "vitest";
import {
  MAX_CARACTERES_GUARDADOS,
  MAX_TURNOS_GUARDADOS,
  UMBRAL_DE_ENOJO,
  animoDe,
  animoForzado,
  bloquesDe,
  hayAlgoNuevo,
  pantallaDe,
  paraGuardar,
  textoParaBelia,
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
  it("reconoce el cliente abierto en su ficha", () => {
    expect(pantallaDe(`/clients/${ID}`)).toEqual({
      ruta: `/clients/${ID}`,
      cliente_id: ID,
    });
    expect(pantallaDe(`/clients/${ID.toUpperCase()}`).cliente_id).toBe(ID);
  });
  it("en las demás pantallas viaja solo la ruta", () => {
    expect(pantallaDe("/quotations")).toEqual({ ruta: "/quotations" });
    expect(pantallaDe("/clients")).toEqual({ ruta: "/clients" });
  });
});

describe("animoDe", () => {
  const base = {
    esperando: null,
    celebrando: false,
    avisando: false,
    dormida: false,
    vencidos: 0,
  };
  it("lo que pasa ahora manda sobre el humor de fondo", () => {
    expect(animoDe({ ...base, esperando: "pensando", celebrando: true })).toBe(
      "pensando",
    );
    expect(animoDe({ ...base, esperando: "trabajando" })).toBe("trabajando");
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

describe("animoForzado", () => {
  it("solo en el laboratorio y solo con un ánimo que existe", () => {
    expect(animoForzado("?belia=dormida", true)).toBe("dormida");
    expect(animoForzado("?belia=dormida", false)).toBeNull();
    expect(animoForzado("?belia=bailando", true)).toBeNull();
    expect(animoForzado("", true)).toBeNull();
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
  it("también con un tope de calendario o un comprobante del portal nuevos", () => {
    expect(hayAlgoNuevo({ ...e(0, 0), topes_de_calendario: 1 }, e(0, 0))).toBe(
      true,
    );
    expect(
      hayAlgoNuevo(
        { ...e(0, 0), comprobantes_por_revisar: 2 },
        { ...e(0, 0), comprobantes_por_revisar: 2 },
      ),
    ).toBe(false);
    // Un motor viejo no trae los números nuevos: no avisa por eso.
    expect(hayAlgoNuevo(e(0, 0), { ...e(0, 0), topes_de_calendario: 3 })).toBe(
      false,
    );
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

describe("una tabla pegada al párrafo", () => {
  it("se lee como tabla aunque no tenga línea en blanco antes ni después", () => {
    const b = bloquesDe(
      "Las que chocan:\n| Choca con | Cotizaciones |\n|---|---|\n| N° 500 | 455, 513 |\nHoy no llegaron requerimientos.",
    );
    expect(b.map((x) => x.tipo)).toEqual(["parrafo", "tabla", "parrafo"]);
  });
});

describe("textoParaBelia", () => {
  it("le cuenta a BelIA qué hizo la persona con su propuesta", () => {
    expect(
      textoParaBelia({
        texto: "Te propongo la leche asada.",
        propuestas: [{ numero: 500, estado: "aplicada" }],
      }),
    ).toBe(
      "Te propongo la leche asada.\n\n(Propuesta de la N° 500: la persona la aplicó y quedó guardada.)",
    );
  });
  it("un evento nuevo todavía no tiene N°", () => {
    expect(
      textoParaBelia({
        texto: "Te propongo la cena.",
        propuestas: [{ numero: null, estado: "pendiente" }],
      }),
    ).toContain(
      "(Propuesta de un evento nuevo: la persona todavía no la aplica.)",
    );
  });
  it("sin propuestas, viaja el texto tal cual", () => {
    expect(textoParaBelia({ texto: "Hola" })).toBe("Hola");
  });
  it("una lección no se confunde con un evento nuevo", () => {
    expect(
      textoParaBelia({
        texto: "Te dejé la lección.",
        propuestas: [{ numero: null, estado: "aplicada", tipo: "leccion" }],
      }),
    ).toContain("(Lección para anotar: la persona la aplicó");
    expect(
      textoParaBelia({
        texto: "Te dejé el evento.",
        propuestas: [
          { numero: null, estado: "descartada", tipo: "cotizacion_nueva" },
        ],
      }),
    ).toContain("(Propuesta de un evento nuevo: la persona dijo que no.)");
  });
});

describe("la conversación que se guarda en Eventia (doc 20 §13)", () => {
  it("no guarda lo que BelIA está escribiendo en vivo", () => {
    expect(
      paraGuardar([
        { rol: "persona", texto: "Hola" },
        { rol: "belia", texto: "Escribien", escribiendo: true },
      ]),
    ).toEqual([{ rol: "persona", texto: "Hola" }]);
  });
  it("guarda los avisos de error y las tarjetas", () => {
    const g = paraGuardar([
      { rol: "belia", texto: "No pude", error: true },
      {
        rol: "belia",
        texto: "Te propongo",
        propuestas: [{ estado: "aplicada" }],
      },
    ]);
    expect(g[0]).toEqual({ rol: "belia", texto: "No pude", error: true });
    expect(g[1].propuestas).toEqual([{ estado: "aplicada" }]);
  });
  it("una tarjeta que se estaba aplicando queda pendiente", () => {
    const g = paraGuardar([
      { rol: "belia", texto: "x", propuestas: [{ estado: "enviando" }] },
    ]);
    expect(g[0].propuestas).toEqual([{ estado: "pendiente" }]);
  });
  it("guarda los 30 más nuevos", () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({
      rol: "persona" as const,
      texto: `pregunta ${i}`,
    }));
    const g = paraGuardar(muchos);
    expect(g).toHaveLength(MAX_TURNOS_GUARDADOS);
    expect(g[0].texto).toBe("pregunta 10");
  });
  it("si pesan demasiado, salen los más viejos, pero el último queda", () => {
    const largo = "a".repeat(30_000);
    const g = paraGuardar([
      { rol: "persona", texto: largo },
      { rol: "belia", texto: largo },
      { rol: "persona", texto: largo },
    ]);
    expect(JSON.stringify(g).length).toBeLessThanOrEqual(
      MAX_CARACTERES_GUARDADOS,
    );
    expect(g).toHaveLength(2);
    expect(g[g.length - 1].rol).toBe("persona");
  });
});
