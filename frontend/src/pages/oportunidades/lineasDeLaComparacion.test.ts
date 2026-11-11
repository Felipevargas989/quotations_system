import { describe, expect, it } from "vitest";
import { CASO, SIN_CAFE, TEXTUM_L1, VALLE } from "./comparacionDePrueba";
import {
  aLaLetra,
  enOrden,
  lineasEnOrden,
  loQueLoDecide,
  montoDe,
  nombreCorto,
  ofertasEnDetalle,
  resumenDeLectura,
  siAceptanTodo,
} from "./lineasDeLaComparacion";

// LA COMPARACIÓN, LÍNEA POR LÍNEA (decisión 125, 11-11): lo que la pantalla
// saca de lo que guardó el motor. El caso es la 5040-14-LE26.

const [L2, L1] = CASO.lineas;

describe("Las líneas de la comparación", () => {
  it("la línea en que compites va primero, y sus oferentes del mayor puntaje al menor", () => {
    expect(lineasEnOrden(CASO).map((l) => l.nombre)).toEqual([
      "Línea 1 · Alimentación",
      "Línea 2 · Técnica",
    ]);
    expect(enOrden(L1).map(nombreCorto)).toEqual([
      "TEXTUM",
      "Valle del Sol Quillon SPA",
    ]);
    expect(enOrden(L2).map((o) => o.puntaje)).toEqual([100, 95.2, 89.4]);
    // Una comparación de antes no trae el nombre corto.
    expect(nombreCorto({ ...VALLE, corto: undefined })).toBe(
      "Valle del Sol Quillon SPA",
    );
  });

  it("el monto de un precio escrito", () => {
    expect(montoDe("$16.855.993 IVA incluido")).toBe(16855993);
    expect(montoDe("$ 2.737.000 neto")).toBe(2737000);
    expect(montoDe("$950")).toBe(950);
    expect(montoDe("no se ve")).toBeNull();
  });

  it("si les aceptan todo: quién gana, por cuántos puntos y cuánto menos ofertó", () => {
    expect(siAceptanTodo(L1)).toEqual({
      titulo: "Gana TEXTUM por 0,6 puntos",
      detalle: "Ofertó $294.007 menos",
      ganasTu: false,
    });
    // Donde no compites, la ventaja es sobre el que sigue.
    expect(siAceptanTodo(L2)).toEqual({
      titulo: "Gana BPM EVENTOS SPA por 4,8 puntos",
      detalle: "Ofertó $533.786 menos",
      ganasTu: false,
    });
    // Si ganas tú.
    expect(
      siAceptanTodo({
        ...L1,
        si_aceptan_todo: VALLE.nombre,
        oferentes: [
          { ...VALLE, puntaje: 100, precio: "$16.000.000" },
          { ...TEXTUM_L1, puntaje: 99 },
        ],
      }),
    ).toEqual({
      titulo: "Ganas tú por 1 punto",
      detalle: "Ofertaste $855.993 menos",
      ganasTu: true,
    });
    // Empate, una sola oferta y una línea vacía.
    expect(
      siAceptanTodo({
        ...L1,
        oferentes: [{ ...VALLE, puntaje: 100 }, TEXTUM_L1],
      }),
    ).toMatchObject({ titulo: "Gana TEXTUM", detalle: "Empatan en puntaje" });
    expect(
      siAceptanTodo({
        ...L1,
        si_aceptan_todo: VALLE.nombre,
        oferentes: [VALLE],
      }),
    ).toEqual({
      titulo: "Ganas tú",
      detalle: "Es la única oferta",
      ganasTu: true,
    });
    expect(
      siAceptanTodo({ ...L1, si_aceptan_todo: null, oferentes: [] }),
    ).toBeNull();
  });

  it("si aplican las bases a la letra: quién gana y quién queda fuera", () => {
    expect(aLaLetra(L1)).toEqual({
      titulo: "Ganas tú",
      detalle: "TEXTUM queda fuera",
      ganasTu: true,
    });
    expect(aLaLetra(L2)).toEqual({
      titulo: "Gana TEXTUM",
      detalle: "BPM EVENTOS SPA y BLISS PRODUCCIONES quedan fuera",
      ganasTu: false,
    });
    // Nadie cumple; y si la que queda fuera es la tuya, lo dice.
    expect(
      aLaLetra({
        ...L1,
        a_la_letra: null,
        oferentes: [{ ...VALLE, cumple_bases: "dudoso" }, TEXTUM_L1],
      }),
    ).toEqual({
      titulo: "Nadie cumple a la letra",
      detalle: "Tu oferta y TEXTUM quedan fuera",
      ganasTu: false,
    });
    expect(
      aLaLetra({
        ...L1,
        oferentes: [VALLE, { ...TEXTUM_L1, cumple_bases: "si" }],
      })?.detalle,
    ).toBe("Nadie queda fuera");
  });

  it("lo que decide una línea: la frase de la IA y lo que puede dejar fuera a quien va primero", () => {
    expect(loQueLoDecide(L1)).toEqual({
      texto: "A Textum le falta el café de la colación",
      de: TEXTUM_L1,
      grave: SIN_CAFE,
    });
    // Una comparación de antes: sin la frase, vale lo grave; sin nada, nada.
    expect(loQueLoDecide({ ...L1, que_lo_decide: "" })?.texto).toBe(
      "La colación no ofrece café",
    );
    expect(
      loQueLoDecide({ ...L1, que_lo_decide: "", oferentes: [VALLE] }),
    ).toBeNull();
  });

  it("cada oferta una vez, con lo suyo de cada línea; la tuya primero", () => {
    const filas = ofertasEnDetalle(CASO);
    expect(filas.map((f) => f.nombre)).toEqual([
      "Valle del Sol Quillon SPA",
      "BLISS PRODUCCIONES",
      "BPM EVENTOS SPA",
      "TEXTUM",
    ]);
    // Textum postula a las dos: una fila, con la línea en que compites antes.
    expect(filas[3].enLineas.map((x) => x.linea.nombre)).toEqual([
      "Línea 1 · Alimentación",
      "Línea 2 · Técnica",
    ]);
    expect(filas[0]).toMatchObject({ es_tuya: true, clave: "n1" });
    expect(resumenDeLectura(filas[2].lectura!)).toBe(
      "leyó 14 de 15 archivos · 2 sin traer",
    );
    expect(resumenDeLectura(filas[0].lectura!)).toBe("leyó 15 de 15 archivos");
    // Una comparación de antes: sin números de oferta ni lectura, por nombre.
    const vieja = ofertasEnDetalle({
      ...CASO,
      lectura: undefined,
      lineas: [
        {
          ...L1,
          oferentes: [
            { ...VALLE, oferta: undefined, corto: undefined },
            { ...TEXTUM_L1, oferta: undefined, corto: undefined },
          ],
        },
      ],
    });
    expect(vieja.map((f) => [f.nombre, f.lectura])).toEqual([
      ["Valle del Sol Quillon SPA", null],
      ["TEXTUM BURGOS Y ORTIZ LIMITADA", null],
    ]);
  });
});
