// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MenusGuardados from "./MenusGuardados";

// "USAR MENÚ GUARDADO" CON GRUPOS (12-10-2026, migración 121). Felipe:
// "¿podría este tener el mismo diseño? así podemos ordenar también los
// menús guardados de cada categoría". Mismo cuidado que la lista de
// paquetes: un título por grupo de la categoría, en su orden, por precio
// dentro, "Otros" al final, el lápiz y "Ordenar grupos…".

const estado = vi.hoisted(() => ({
  grupos: [] as {
    id: number;
    name: string;
    category: string;
    sort_order: number;
  }[],
}));

vi.mock("../../hooks/useGruposDeMenus", () => ({
  useGruposDeMenus: () => ({
    gruposDe: (categoria: string) =>
      estado.grupos.filter((g) => g.category === categoria),
    crear: vi.fn(),
    renombrar: vi.fn(),
    ordenar: vi.fn(),
    borrar: vi.fn(),
    asignar: vi.fn(),
  }),
}));

afterEach(cleanup);

const menu = (
  id: number,
  name: string,
  precio: number,
  menu_group_id: number | null,
  category = "Almuerzo",
) =>
  ({
    id,
    name,
    category,
    menu_group_id,
    items: [{ quantity: 1, service: { price: precio } }],
  }) as never;

const pintar = (menus: never[], conCategoria = true) =>
  render(
    <MenusGuardados
      grupos={menus}
      conCategoria={conCategoria}
      confirmandoId={null}
      onElegir={vi.fn()}
      onPedirEliminar={vi.fn()}
      onConfirmarEliminar={vi.fn()}
      onCancelarEliminar={vi.fn()}
      onRenombrar={vi.fn()}
    />,
  );

const enOrden = (texto: string, partes: string[]) => {
  let desde = -1;
  for (const parte of partes) {
    const i = texto.indexOf(parte, desde + 1);
    expect(i, `"${parte}" debería venir después`).toBeGreaterThan(desde);
    desde = i;
  }
};

const textoDeLaLista = (container: HTMLElement) =>
  container.querySelector(".max-h-96")?.textContent ?? "";

describe("MenusGuardados con grupos", () => {
  it("un título por grupo de la categoría, por precio dentro y Otros al final", () => {
    estado.grupos = [
      { id: 2, name: "Nivel 2", category: "Almuerzo", sort_order: 2 },
      { id: 1, name: "Nivel 1", category: "Almuerzo", sort_order: 1 },
      { id: 9, name: "Nivel 1", category: "Desayuno", sort_order: 1 },
    ];
    const { container } = pintar([
      menu(1, "Mechada - Puré", 16900, 2),
      menu(2, "Cazuela de ave - Macedonia", 10900, 1),
      menu(3, "Lomo liso - Papas rústicas (matrimonio)", 34700, null),
      menu(4, "Pollo al jugo - Arroz", 10800, 1),
    ]);
    enOrden(textoDeLaLista(container), [
      "Nivel 1",
      "Pollo al jugo - Arroz",
      "Cazuela de ave - Macedonia",
      "Nivel 2",
      "Mechada - Puré",
      "Otros",
      "Lomo liso",
    ]);
  });

  it("sin grupos en la categoría, la lista queda como antes", () => {
    estado.grupos = [];
    const { container } = pintar([
      menu(1, "Caro", 20000, null),
      menu(2, "Barato", 9000, null),
    ]);
    const texto = textoDeLaLista(container);
    expect(texto).not.toContain("Otros");
    enOrden(texto, ["Barato", "Caro"]);
    expect(screen.getByText("Ordenar grupos…")).toBeInTheDocument();
  });

  it("el lápiz abre la edición del menú con su nombre", () => {
    estado.grupos = [];
    pintar([menu(1, "Mechada - Puré", 16900, null)]);
    fireEvent.click(screen.getByLabelText("Editar Mechada - Puré"));
    expect(screen.getByText("Editar menú guardado")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mechada - Puré")).toBeInTheDocument();
  });

  it("«Ordenar grupos…» abre los grupos de ESA categoría", () => {
    estado.grupos = [
      { id: 1, name: "Nivel 1", category: "Almuerzo", sort_order: 1 },
    ];
    pintar([menu(1, "Mechada - Puré", 16900, 1)]);
    fireEvent.click(screen.getByText("Ordenar grupos…"));
    expect(screen.getByText("Grupos de Almuerzo")).toBeInTheDocument();
  });

  it("sin categoría en la casilla no hay grupos ni «Ordenar grupos…»", () => {
    estado.grupos = [
      { id: 1, name: "Nivel 1", category: "Almuerzo", sort_order: 1 },
    ];
    const { container } = pintar(
      [
        menu(1, "Mechada - Puré", 16900, 1),
        menu(2, "Huevo - Pan", 8700, null, "Desayuno"),
      ],
      false,
    );
    expect(textoDeLaLista(container)).not.toContain("Nivel 1");
    expect(screen.queryByText("Ordenar grupos…")).not.toBeInTheDocument();
  });
});
