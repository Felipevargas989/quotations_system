import { describe, it, expect } from "vitest";
import { COLORES_DE_EVENTO, colorDelEvento } from "./coloresDeEvento";

/** UN COLOR POR EVENTO (Felipe, 09-11-2026): el mismo evento, el mismo color. */
describe("colorDelEvento", () => {
  it("el mismo número da siempre el mismo color", () => {
    expect(colorDelEvento(616)).toBe(colorDelEvento(616));
  });
  it("números seguidos dan colores distintos", () => {
    expect(colorDelEvento(521)).not.toBe(colorDelEvento(522));
  });
  it("sin número no se cae: usa el primero", () => {
    expect(colorDelEvento(undefined)).toBe(COLORES_DE_EVENTO[0]);
    expect(colorDelEvento(Number.NaN)).toBe(COLORES_DE_EVENTO[0]);
  });
  it("no usa los colores que ya significan algo en la sábana", () => {
    const todas = COLORES_DE_EVENTO.map((c) => Object.values(c).join(" ")).join(
      " ",
    );
    for (const prohibido of [
      "emerald",
      "green",
      "amber",
      "blue",
      "violet",
      "gray",
    ])
      expect(todas).not.toContain(prohibido);
  });
});
