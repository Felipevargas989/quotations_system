// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SelectorDePaquetes from "./SelectorDePaquetes";

// "PARTIR DE UN PAQUETE" CON GRUPOS (12-10-2026, migración 120). Felipe:
// "un cliente me pregunta por un paseo y debo tener dos o tres
// alternativas juntas" y "mejor crear y editar listas". Lo que cuidan
// estas pruebas: un título por grupo en el orden que decide la empresa,
// de menor a mayor precio dentro, los sin grupo al final bajo "Otros",
// la lista de siempre si no hay grupos, el buscador que encuentra por el
// nombre del grupo y el lápiz de cada paquete.

const estado = vi.hoisted(() => ({
  grupos: [] as { id: number; name: string; sort_order: number }[],
}));

vi.mock("../../hooks/useGruposDePaquetes", () => ({
  useGruposDePaquetes: () => ({
    grupos: estado.grupos,
    crear: vi.fn(),
    renombrar: vi.fn(),
    ordenar: vi.fn(),
    borrar: vi.fn(),
    editarPaquete: vi.fn(),
  }),
}));

afterEach(cleanup);

const FULL_DAY = { id: 1, name: "Full day", sort_order: 1 };
const MATRIMONIO = { id: 2, name: "Matrimonio", sort_order: 2 };

const paquete = (
  id: number,
  name: string,
  precio: number,
  package_group_id: number | null,
) =>
  ({
    id,
    name,
    package_group_id,
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

describe("SelectorDePaquetes con grupos", () => {
  it("un título por grupo, por precio dentro, y los sin grupo al final", () => {
    estado.grupos = [FULL_DAY, MATRIMONIO];
    const { container } = abrir([
      paquete(1, "Matrimonio: de noche", 64100, 2),
      paquete(2, "Full day: empresa", 57000, 1),
      paquete(3, "Paquete viejo", 1000, null),
      paquete(4, "Full day: adulto mayor", 34300, 1),
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

  it("el orden de los grupos es el que decide la empresa", () => {
    estado.grupos = [
      { ...MATRIMONIO, sort_order: 1 },
      { ...FULL_DAY, sort_order: 2 },
    ];
    const { container } = abrir([
      paquete(1, "Barato de full day", 10000, 1),
      paquete(2, "Caro de matrimonio", 90000, 2),
    ]);
    enOrden(textoDeLaLista(container), [
      "Matrimonio",
      "Caro de matrimonio",
      "Full day",
      "Barato de full day",
    ]);
  });

  it("sin grupos creados, la lista queda como antes", () => {
    estado.grupos = [];
    const { container } = abrir([
      paquete(1, "Paseo caro", 50000, null),
      paquete(2, "Paseo barato", 20000, null),
    ]);
    const texto = textoDeLaLista(container);
    expect(texto).not.toContain("Otros");
    enOrden(texto, ["Paseo barato", "Paseo caro"]);
  });

  it("el buscador encuentra por el nombre del grupo", () => {
    estado.grupos = [FULL_DAY, MATRIMONIO];
    const { container } = abrir([
      paquete(1, "Estándar", 44300, 1),
      paquete(2, "Empresa", 57000, 1),
      paquete(3, "De noche", 64100, 2),
    ]);
    fireEvent.change(screen.getByLabelText("Buscar paquete"), {
      target: { value: "full day" },
    });
    const texto = textoDeLaLista(container);
    enOrden(texto, ["Full day", "Estándar", "Empresa"]);
    expect(texto).not.toContain("De noche");
  });

  it("el lápiz abre la edición del paquete con su nombre", () => {
    estado.grupos = [FULL_DAY];
    abrir([paquete(2, "Full day: empresa", 57000, 1)]);
    fireEvent.click(screen.getByLabelText("Editar Full day: empresa"));
    expect(screen.getByText("Editar paquete")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Full day: empresa")).toBeInTheDocument();
  });
});
