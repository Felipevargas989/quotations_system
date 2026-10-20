// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MenuGuardadoDeCaja from "./MenuGuardadoDeCaja";

// «USAR MENÚ GUARDADO» EN LA PESTAÑA SERVICIOS (20-10-2026). Felipe: "el
// botón elegir menú nunca desaparece, trae la cantidad de servicios (no suma
// nada) y no trae el precio". La pieza del cotizador, con su propio cierre.

const menus = vi.hoisted(() => [
  {
    id: 1,
    name: "Asado buffet - Papas mayo",
    category: "Almuerzo",
    menu_group_id: null,
    items: [{ quantity: 1, service: { id: 10, name: "Asado", price: 9000 } }],
  },
  {
    id: 2,
    name: "Cazuela de ave - Macedonia",
    category: "Almuerzo",
    menu_group_id: null,
    items: [{ quantity: 1, service: { id: 11, name: "Cazuela", price: 7500 } }],
  },
  {
    id: 3,
    name: "Desayuno americano",
    category: "Desayuno",
    menu_group_id: null,
    items: [{ quantity: 1, service: { id: 12, name: "Huevos", price: 4000 } }],
  },
]);

vi.mock("../../hooks/useServiceGroups", () => ({
  useServiceGroups: () => ({
    groups: menus,
    removeGroup: vi.fn(),
    renameGroup: vi.fn(),
  }),
}));

vi.mock("../../hooks/useGruposDeMenus", () => ({
  useGruposDeMenus: () => ({
    gruposDe: () => [],
    crear: vi.fn(),
    renombrar: vi.fn(),
    ordenar: vi.fn(),
    borrar: vi.fn(),
    asignar: vi.fn(),
  }),
}));

afterEach(cleanup);

const abrir = (categoria: string, onElegir = vi.fn()) => {
  render(
    <div>
      <p>afuera</p>
      <MenuGuardadoDeCaja categoria={categoria} onElegir={onElegir} />
    </div>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Usar menú guardado/ }));
  return onElegir;
};

describe("MenuGuardadoDeCaja", () => {
  it("con categoría muestra solo sus menús, con el precio por persona y sin «N servicios»", () => {
    abrir("Almuerzo");
    expect(screen.getByText(/Asado buffet - Papas mayo/)).toBeInTheDocument();
    expect(screen.getByText(/Cazuela de ave - Macedonia/)).toBeInTheDocument();
    expect(screen.queryByText(/Desayuno americano/)).not.toBeInTheDocument();
    expect(screen.getByText(/9\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/servicios$/)).not.toBeInTheDocument();
  });

  it("al elegir un menú lo entrega y el panel se cierra", () => {
    const onElegir = abrir("Almuerzo");
    fireEvent.click(screen.getByText(/Cazuela de ave - Macedonia/));
    expect(onElegir).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, category: "Almuerzo" }),
    );
    expect(
      screen.queryByPlaceholderText(/Buscar menú/),
    ).not.toBeInTheDocument();
  });

  it("al pinchar fuera se cierra (antes el cuadro quedaba pegado)", () => {
    abrir("Almuerzo");
    expect(screen.getByPlaceholderText(/Buscar menú/)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("afuera"));
    expect(
      screen.queryByPlaceholderText(/Buscar menú/),
    ).not.toBeInTheDocument();
  });

  it("sin categoría en la casilla muestra todos los menús", () => {
    abrir("");
    expect(screen.getByText(/Desayuno americano/)).toBeInTheDocument();
    expect(screen.getByText(/Asado buffet - Papas mayo/)).toBeInTheDocument();
  });
});
