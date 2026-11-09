import { describe, it, expect } from "vitest";
import { COLORES_DE_EVENTO, colorDelEvento } from "./coloresDeEvento";

/** UN COLOR POR EVENTO (Felipe, 09-11-2026), repartido en orden por la cascada. */
describe("colorDelEvento", () => {
  it("dos eventos seguidos nunca llevan el mismo color", () => {
    for (let i = 0; i < 20; i++)
      expect(colorDelEvento(i)).not.toBe(colorDelEvento(i + 1));
  });
  it("se repite recién después de seis", () => {
    expect(colorDelEvento(0)).toBe(colorDelEvento(6));
    expect(new Set([0, 1, 2, 3, 4, 5].map(colorDelEvento)).size).toBe(6);
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
