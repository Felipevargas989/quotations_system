// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SelectorDePaquetes from "./SelectorDePaquetes";

// "PARTIR DE UN PAQUETE" AGRUPADO (12-10-2026). Felipe: "un cliente me
// pregunta por un paseo y debo tener dos o tres alternativas juntas y si
// no tengo que estar scrolleando mucho". Lo que cuidan estas pruebas: un
// título por grupo (lo que va antes de los dos puntos), de menor a mayor
// precio dentro de cada grupo, los sin grupo al final bajo "Otros", y que
// una empresa sin grupos vea la lista como antes.

afterEach(cleanup);

const paquete = (id: number, name: string, precio: number) =>
  ({
    id,
    name,
    groups: [
      { group: { items: [{ quantity: 1, service: { price: precio } }] } },
    ],
    services: [],
  }) as never;

const abrir = (paquetes: never[]) => {
  const vista = render(
    <SelectorDePaquetes
      paquetes={paquetes}
      deshabilitado={false}
      puedeCrear
      hayServiciosCargados={() => false}
      onCargar={vi.fn()}
      onEliminar={vi.fn()}
      onCrearNuevo={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Partir de un paquete/ }));
  return vista;
};

// El texto de la lista, en el orden en que se ve.
const textoDeLaLista = (container: HTMLElement) =>
  container.querySelector(".max-h-96")?.textContent ?? "";

const enOrden = (texto: string, partes: string[]) => {
  let desde = -1;
  for (const parte of partes) {
    const i = texto.indexOf(parte, desde + 1);
    expect(i, `"${parte}" debería venir después`).toBeGreaterThan(desde);
    desde = i;
  }
};

describe("SelectorDePaquetes agrupado", () => {
  it("un título por grupo, por precio dentro, y los sin grupo al final", () => {
    const { container } = abrir([
      paquete(1, "Matrimonio: de noche", 64100),
      paquete(2, "Full day: empresa", 57000),
      paquete(3, "Paquete viejo", 1000),
      paquete(4, "Full day: adulto mayor", 34300),
    ]);
    enOrden(textoDeLaLista(container), [
      "Full day",
      "Adulto mayor",
      "$34.300",
      "Empresa",
      "$57.000",
      "Matrimonio",
      "De noche",
      "Otros",
      "Paquete viejo",
    ]);
  });

  it("sin grupos, la lista queda como antes: sin títulos y por precio", () => {
    const { container } = abrir([
      paquete(1, "Paseo caro", 50000),
      paquete(2, "Paseo barato", 20000),
    ]);
    const texto = textoDeLaLista(container);
    expect(texto).not.toContain("Otros");
    enOrden(texto, ["Paseo barato", "Paseo caro"]);
  });

  it("el buscador mira el nombre entero: 'full day' trae todo el grupo", () => {
    const { container } = abrir([
      paquete(1, "Matrimonio: de noche", 64100),
      paquete(2, "Full day: empresa", 57000),
      paquete(4, "Full day: adulto mayor", 34300),
    ]);
    fireEvent.change(screen.getByLabelText("Buscar paquete"), {
      target: { value: "full day" },
    });
    const texto = textoDeLaLista(container);
    enOrden(texto, ["Full day", "Adulto mayor", "Empresa"]);
    expect(texto).not.toContain("Matrimonio");
  });
});
