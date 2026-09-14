import { describe, expect, it } from "vitest";
import { preseleccionDesdeEnlace } from "./preseleccionDesdeEnlace";

// El enlace de un anuncio puede abrir el cotizador con el tipo ya
// elegido. Acá se comprueba que calza sin tildes ni mayúsculas, que un
// pedido parcial encuentra el tipo, y que nada raro elige nada.
const clientes = [
  "Colegios & Universidades",
  "Particulares",
  "Tour Operadores",
  "Empresas",
  "Iglesias",
  "Empresas Publicas",
];
const eventos = ["Almuerzo o Cena", "Estadía y Alimentación", "Uso salones"];

describe("preseleccionDesdeEnlace", () => {
  it("calza el tipo exacto sin importar tildes ni mayúsculas", () => {
    expect(
      preseleccionDesdeEnlace("cliente", clientes, "?cliente=IGLESIAS"),
    ).toBe("Iglesias");
    expect(
      preseleccionDesdeEnlace(
        "evento",
        eventos,
        "?evento=estadia%20y%20alimentacion",
      ),
    ).toBe("Estadía y Alimentación");
  });

  it("un pedido parcial encuentra el tipo que empieza así", () => {
    expect(preseleccionDesdeEnlace("evento", eventos, "?evento=estadia")).toBe(
      "Estadía y Alimentación",
    );
    expect(preseleccionDesdeEnlace("cliente", clientes, "?cliente=tour")).toBe(
      "Tour Operadores",
    );
  });

  it("el exacto manda sobre el parcial", () => {
    expect(
      preseleccionDesdeEnlace("cliente", clientes, "?cliente=empresas"),
    ).toBe("Empresas");
  });

  it("no elige nada si el enlace no trae el parámetro o no calza", () => {
    expect(preseleccionDesdeEnlace("cliente", clientes, "")).toBeUndefined();
    expect(
      preseleccionDesdeEnlace("cliente", clientes, "?cliente="),
    ).toBeUndefined();
    expect(
      preseleccionDesdeEnlace("cliente", clientes, "?cliente=marcianos"),
    ).toBeUndefined();
    expect(
      preseleccionDesdeEnlace("evento", eventos, "?cliente=iglesias"),
    ).toBeUndefined();
  });
});
