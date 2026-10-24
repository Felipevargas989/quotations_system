// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ParrafoDelWord } from "../../services/editorDelWord.service";
import {
  cambio,
  cuantosPendientes,
  htmlDelParrafo,
  paraGuardar,
  parrafosPorId,
  tramosDelElemento,
} from "./reglasDelEditor";

// LAS REGLAS DEL EDITOR DE WORD (decisión 78): lo que se dibuja para
// escribir encima se lee de vuelta igual si nadie lo tocó, y lo que se
// escribe sale con su corrida y su formato.

const PARRAFO: ParrafoDelWord = {
  tipo: "parrafo",
  id: 3,
  editable: true,
  formato: { b: false, i: false, u: false, pt: 11 },
  tramos: [
    { r: 0, t: "RAZÓN SOCIAL ", b: true, i: false, u: false, pt: 11 },
    {
      r: 1,
      t: "[COMPLETAR: razón social]\nfin",
      b: false,
      i: false,
      u: false,
      pt: 11,
    },
  ],
};

/** El párrafo como lo dibuja el editor: el <p> con su formato y adentro
 *  sus pedazos. */
const dibujar = (p: ParrafoDelWord, estilo = "font-weight:400") => {
  const el = document.createElement("p");
  el.setAttribute("style", estilo);
  el.innerHTML = htmlDelParrafo(p);
  return el;
};

describe("htmlDelParrafo y tramosDelElemento", () => {
  it("sin tocarlo, se lee igual: no cambió", () => {
    const el = dibujar(PARRAFO);
    expect(el.querySelector("mark[data-completar]")?.textContent).toBe(
      "[COMPLETAR: razón social]",
    );
    expect(cambio(PARRAFO, tramosDelElemento(el))).toBe(false);
  });

  it("lo escrito dentro de un pedazo queda con su corrida", () => {
    const el = dibujar(PARRAFO);
    const mark = el.querySelector("mark");
    if (!mark?.firstChild) throw new Error("sin pendiente");
    mark.firstChild.nodeValue = "Valle del Sol SpA";
    const ahora = tramosDelElemento(el);
    expect(ahora).toEqual([
      { r: 0, t: "RAZÓN SOCIAL ", b: true, i: false, u: false },
      { r: 1, t: "Valle del Sol SpA\nfin", b: false, i: false, u: false },
    ]);
    expect(cambio(PARRAFO, ahora)).toBe(true);
  });

  it("la negrita del navegador (<b>) y el «no negrita» dentro de un pedazo en negrita", () => {
    const el = document.createElement("p");
    el.innerHTML =
      '<span data-r="0" style="font-weight:400">Hola <b>mundo</b></span><span data-r="1" style="font-weight:700">uno <span style="font-weight: normal;">dos</span></span>';
    expect(tramosDelElemento(el)).toEqual([
      { r: 0, t: "Hola ", b: false, i: false, u: false },
      { r: 0, t: "mundo", b: true, i: false, u: false },
      { r: 1, t: "uno ", b: true, i: false, u: false },
      { r: 1, t: "dos", b: false, i: false, u: false },
    ]);
  });

  it("lo escrito fuera de los pedazos toma el formato del párrafo, sin corrida", () => {
    const el = dibujar(
      { ...PARRAFO, tramos: [] },
      "font-weight:400;font-style:italic",
    );
    el.append("nuevo");
    expect(tramosDelElemento(el)).toEqual([
      { t: "nuevo", b: false, i: true, u: false },
    ]);
  });

  it("el <br> que pone el navegador al final no es un salto; un bloque que se coló sí", () => {
    const el = document.createElement("p");
    el.innerHTML =
      '<span data-r="0" style="font-weight:400">uno<br></span><div>dos</div>';
    expect(tramosDelElemento(el)).toEqual([
      { r: 0, t: "uno\n", b: false, i: false, u: false },
      { t: "\ndos", b: false, i: false, u: false },
    ]);
    const conBr = document.createElement("p");
    conBr.innerHTML = '<span data-r="0" style="font-weight:400">uno<br></span>';
    expect(tramosDelElemento(conBr)).toEqual([
      { r: 0, t: "uno", b: false, i: false, u: false },
    ]);
  });

  it("un párrafo que termina en salto de línea se lee igual", () => {
    const p: ParrafoDelWord = {
      ...PARRAFO,
      tramos: [{ r: 0, t: "uno\n", b: false, i: false, u: false }],
    };
    expect(cambio(p, tramosDelElemento(dibujar(p)))).toBe(false);
  });

  it("el espacio duro del navegador cuenta como espacio y se manda como espacio", () => {
    const p: ParrafoDelWord = {
      ...PARRAFO,
      tramos: [{ r: 0, t: "a b", b: false, i: false, u: false }],
    };
    const ahora = [{ r: 0, t: "a\u00a0b", b: false, i: false, u: false }];
    expect(cambio(p, ahora)).toBe(false);
    expect(paraGuardar(ahora)[0].t).toBe("a b");
  });
});

describe("parrafosPorId y cuantosPendientes", () => {
  it("solo los editables, también los de una tabla", () => {
    const ids = parrafosPorId([
      PARRAFO,
      { ...PARRAFO, id: 4, editable: false, motivo: "tiene una imagen" },
      {
        tipo: "tabla",
        filas: [[{ bloques: [{ ...PARRAFO, id: 7 }] }]],
      },
    ]);
    expect([...ids.keys()]).toEqual([3, 7]);
  });

  it("cuenta los [COMPLETAR] que quedan", () => {
    expect(
      cuantosPendientes("[COMPLETAR: piscina] y [COMPLETAR: guardias] listo"),
    ).toBe(2);
    expect(cuantosPendientes("todo listo")).toBe(0);
  });
});
