// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cuerpoDeLaHoja } from "./imprimirHoja";

/** EL DETALLE DEL DÍA, IMPRIMIBLE (Felipe, 23-11-2026). */
describe("cuerpoDeLaHoja", () => {
  const armar = () => {
    const nodo = document.createElement("div");
    nodo.innerHTML = `
      <h2>lun 23 de nov</h2>
      <div data-no-imprimir><button>Imprimir</button><button>X</button></div>
      <span>Almuerzo</span><input value="">
      <table><tr><td><button class="link">Ana Pérez</button></td><td>9 h</td><td data-dinero>$28.000</td></tr></table>
      <div data-dinero>Total del día $28.000</div>`;
    (nodo.querySelector("input") as HTMLInputElement).value = "13:30";
    return nodo;
  };

  it("la hora tecleada sale escrita, no como campo vacío", () => {
    const html = cuerpoDeLaHoja(armar());
    expect(html).toContain("13:30");
    expect(html).not.toContain("<input");
  });
  it("los botones Imprimir y la ✕ no van en la hoja", () => {
    const html = cuerpoDeLaHoja(armar());
    expect(html).not.toContain("Imprimir");
    expect(html).not.toContain("data-no-imprimir");
  });
  it("sin dinero: ni el pago ni el total del día", () => {
    const html = cuerpoDeLaHoja(armar());
    expect(html).not.toContain("$");
    expect(html).not.toContain("Total del día");
  });
  it("lo demás va igual, y sin botones", () => {
    const html = cuerpoDeLaHoja(armar());
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("9 h");
    expect(html).not.toContain("<button");
  });
  it("no toca la pantalla", () => {
    const nodo = armar();
    cuerpoDeLaHoja(nodo);
    expect(nodo.querySelector("input")).not.toBeNull();
    expect(nodo.querySelectorAll("button").length).toBe(3);
  });
});
