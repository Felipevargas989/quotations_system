import { describe, it, expect } from "vitest";
import { barraDelEvento } from "./barraDelEvento";
import { colorDelEvento } from "./coloresDeEvento";

/** EL NÚMERO LLEVA AL EVENTO (Felipe, 19-11-2026: "que ahí en el número,
 *  si pincho, me lleve al evento"). */
describe("barraDelEvento", () => {
  const fila = {
    quotationId: "abc-123",
    evento: "#500 · Rudel S.A. · lun 9 nov al dom 22 nov",
    diasDelEvento: new Set(["2026-11-09"]),
  };
  const color = colorDelEvento(0);

  it("parte el rótulo en número y detalle", () => {
    const b = barraDelEvento(fila, color, true);
    expect(b?.numero).toBe("#500");
    expect(b?.detalle).toBe("Rudel S.A. · lun 9 nov al dom 22 nov");
  });
  it("el número enlaza a la ficha del evento en Post-Venta", () => {
    expect(barraDelEvento(fila, color, true)?.enlace).toBe(
      "/post-venta/abc-123",
    );
  });
  it("sin permiso de Post-Venta, el número queda como texto", () => {
    expect(barraDelEvento(fila, color, false)?.enlace).toBeUndefined();
  });
  it("el staff (sin evento) no lleva barra", () => {
    expect(
      barraDelEvento({ ...fila, quotationId: null }, color, true),
    ).toBeUndefined();
  });
});
