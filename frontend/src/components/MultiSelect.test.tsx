// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MultiSelect, { type MultiSelectOption } from "./MultiSelect";

// El modo compacto de la lista de varias (05-11-2026): el filtro por tipo
// de cliente del tablero. Sin `compacto`, la pieza queda como siempre.

const OPCIONES: MultiSelectOption[] = [
  {
    value: "empresas",
    label: "Empresas",
    cantidad: 3,
    dotClass: "bg-orange-500",
  },
  { value: "iglesias", label: "Iglesias", cantidad: 0 },
  { value: "particulares", label: "Particulares", cantidad: 15 },
];

const pintar = (value: string[], onChange = vi.fn(), compacto = true) =>
  render(
    <MultiSelect
      compacto={compacto}
      options={OPCIONES}
      value={value}
      onChange={onChange}
      placeholder="Tipo de cliente"
    />,
  );

afterEach(cleanup);

describe("la lista de varias, compacta", () => {
  it("sin nada elegido dice qué filtra y abre la lista entera, con sus números y sin «Seleccionar Todo»", () => {
    const onChange = vi.fn();
    pintar([], onChange);
    fireEvent.click(screen.getByRole("button", { name: /Tipo de cliente/ }));
    expect(screen.getByText("Particulares")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.queryByText("Seleccionar Todo")).not.toBeInTheDocument();
    expect(screen.queryByText("Ver todos")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Empresas"));
    expect(onChange).toHaveBeenCalledWith(["empresas"]);
  });

  it("con uno elegido, el chip lleva su nombre; con varios, «+N»", () => {
    pintar(["particulares"]);
    expect(
      screen.getByRole("button", { name: /^Particulares/ }),
    ).toBeInTheDocument();
    cleanup();
    pintar(["empresas", "iglesias", "particulares"]);
    expect(
      screen.getByRole("button", { name: /Empresas \+2/ }),
    ).toBeInTheDocument();
  });

  it("la × del chip y «Ver todos» lo limpian", () => {
    const onChange = vi.fn();
    pintar(["empresas"], onChange);
    fireEvent.click(screen.getByLabelText("Quitar el filtro"));
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole("button", { name: /^Empresas/ }));
    fireEvent.click(screen.getByText("Ver todos"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("el menú cuelga del borde derecho del chip, el que no se corre al elegir (06-11-2026)", () => {
    pintar([]);
    fireEvent.click(screen.getByRole("button", { name: /Tipo de cliente/ }));
    const menu = screen.getByText("Particulares").closest(".absolute");
    expect(menu).toHaveClass("right-0");
    expect(menu).not.toHaveClass("left-0");
  });

  it("sin `compacto` queda como siempre: con «Seleccionar Todo» y «Limpiar Todo»", () => {
    pintar([], vi.fn(), false);
    fireEvent.click(screen.getByRole("button", { name: /Tipo de cliente/ }));
    expect(screen.getByText("Seleccionar Todo")).toBeInTheDocument();
    expect(screen.getByText("Limpiar Todo")).toBeInTheDocument();
  });
});
