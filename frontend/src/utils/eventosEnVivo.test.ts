import { describe, expect, it } from "vitest";
import { leerEventos } from "./eventosEnVivo";

describe("leerEventos", () => {
  it("lee lo completo y recuerda hasta dónde, aunque un evento llegue partido", () => {
    const vistos: [string, unknown][] = [];
    const alLeer = (e: string, d: unknown) => vistos.push([e, d]);
    const parte1 =
      'event: texto\ndata: {"tipo":"texto","texto":"Hola"}\n\nevent: te';
    let leido = leerEventos(parte1, 0, alLeer);
    expect(vistos).toEqual([["texto", { tipo: "texto", texto: "Hola" }]]);
    const todo = `${parte1}xto\ndata: {"tipo":"texto","texto":", Camila"}\n\nevent: fin\ndata: {"respuesta":"Hola, Camila"}\n\n`;
    leido = leerEventos(todo, leido, alLeer);
    expect(leido).toBe(todo.length);
    expect(vistos.map(([e]) => e)).toEqual(["texto", "texto", "fin"]);
  });
  it("salta lo que no se puede leer", () => {
    const vistos: string[] = [];
    leerEventos("event: texto\ndata: {roto\n\n", 0, (e) => vistos.push(e));
    expect(vistos).toEqual([]);
  });
});
