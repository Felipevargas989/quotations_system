/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturarOrigen, origenDelLead } from "./origenDelLead";

// ORIGEN DEL LEAD (migración 110): la huella vive en la dirección con la
// que la persona aterriza y se pierde apenas navega. Acá se comprueba que
// se captura, que el primer toque manda, y que medir jamás tumba el
// formulario.
const aterrizarEn = (busqueda: string, referente = "") => {
  Object.defineProperty(window, "location", {
    value: { search: busqueda, hostname: "www.eventi-app.com" },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(document, "referrer", {
    value: referente,
    configurable: true,
  });
};

describe("capturarOrigen", () => {
  beforeEach(() => sessionStorage.clear());

  it("guarda la huella de Google y las etiquetas de campaña", () => {
    aterrizarEn("?gclid=Cj0KCQ&utm_campaign=paseos&utm_source=google");
    capturarOrigen();
    expect(origenDelLead()).toEqual({
      gclid: "Cj0KCQ",
      utm_campaign: "paseos",
      utm_source: "google",
    });
  });

  it("ignora los parámetros que no son de origen", () => {
    aterrizarEn("?gclid=abc&token=secreto&id=7");
    capturarOrigen();
    expect(origenDelLead()).toEqual({ gclid: "abc" });
  });

  it("EL PRIMER TOQUE MANDA: una segunda llegada no pisa la primera", () => {
    aterrizarEn("?gclid=el-primero");
    capturarOrigen();
    aterrizarEn("?fbclid=el-segundo");
    capturarOrigen();
    expect(origenDelLead()).toEqual({ gclid: "el-primero" });
  });

  it("guarda el referente solo si viene de afuera", () => {
    aterrizarEn("", "https://l.instagram.com/");
    capturarOrigen();
    expect(origenDelLead()).toEqual({ referrer: "https://l.instagram.com/" });
  });

  it("navegar dentro del propio sitio NO es un origen", () => {
    aterrizarEn("", "https://www.eventi-app.com/otra-pagina");
    capturarOrigen();
    expect(origenDelLead()).toBeUndefined();
  });

  it("sin huella ni referente no guarda nada", () => {
    aterrizarEn("");
    capturarOrigen();
    expect(origenDelLead()).toBeUndefined();
  });

  it("si el almacenamiento falla, no revienta — medir no rompe el formulario", () => {
    aterrizarEn("?gclid=abc");
    const romper = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("almacenamiento bloqueado");
      });
    expect(() => capturarOrigen()).not.toThrow();
    romper.mockRestore();
  });
});
