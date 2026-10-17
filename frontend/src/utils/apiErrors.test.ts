import { describe, expect, it } from "vitest";
import { humanizeApiError } from "./apiErrors";

/** Un error como lo entrega axios cuando el motor responde. */
const respuesta = (message: unknown) => ({ response: { data: { message } } });

describe("humanizeApiError", () => {
  it("el mensaje en español del motor se muestra tal cual", () => {
    expect(
      humanizeApiError(respuesta('"bases.html" no se puede subir'), "x"),
    ).toBe('"bases.html" no se puede subir');
  });

  it("la falla de fábrica de Nest, en inglés, cambia por el mensaje de la pantalla (17-10)", () => {
    expect(
      humanizeApiError(
        respuesta("Internal server error"),
        'No se pudo subir "Bases.pdf".',
      ),
    ).toBe('No se pudo subir "Bases.pdf".');
  });

  it("un 503 con mensaje propio se sigue mostrando", () => {
    expect(
      humanizeApiError(respuesta("La base de datos está lenta"), "x"),
    ).toBe("La base de datos está lenta");
  });

  it("los campos conocidos se traducen", () => {
    expect(humanizeApiError(respuesta(["client_id must be a string"]))).toBe(
      "Falta seleccionar el cliente",
    );
  });

  it("sin conexión lo dice", () => {
    expect(humanizeApiError(new Error("Network Error"))).toContain(
      "No hay conexión",
    );
  });
});
