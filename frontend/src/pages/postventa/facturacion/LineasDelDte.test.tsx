// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LineaPedida } from "../../../services/facturas.service";
import LineasDelDte from "./LineasDelDte";

// LA DESCRIPCIÓN LARGA, PLEGADA EN CADA LÍNEA (doc 19 §9.20). Felipe,
// 06-11: «ok a ambas». Se abre con «+ Descripción larga» y «Quitar» la saca
// del DTE; si BelIA trae el texto largo de la OC, ya viene abierta.

afterEach(cleanup);

const LINEA: LineaPedida = {
  descripcion: "Carro de Palomita, Algodón y Fuente de Frutilla",
  descripcion_larga: null,
  cantidad: 1,
  precio: 450000,
};

const abrir = (lineas: LineaPedida[]) => {
  const onChange = vi.fn();
  render(<LineasDelDte lineas={lineas} montos={null} onChange={onChange} />);
  return onChange;
};

describe("La descripción larga", () => {
  it("sin texto, va plegada: «+ Descripción larga» la abre vacía", () => {
    const onChange = abrir([LINEA]);
    expect(
      screen.queryByRole("textbox", { name: "Descripción larga" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descripción larga" }));
    expect(onChange).toHaveBeenCalledWith([
      { ...LINEA, descripcion_larga: "" },
    ]);
  });

  it("con el texto que trajo BelIA, viene abierta, y «Quitar» la saca del DTE", () => {
    const larga =
      "Carro de Palomita, Algodón y Fuente de Frutilla con Chocolate.";
    const onChange = abrir([{ ...LINEA, descripcion_larga: larga }]);
    expect(
      screen.getByRole("textbox", { name: "Descripción larga" }),
    ).toHaveValue(larga);
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onChange).toHaveBeenCalledWith([
      { ...LINEA, descripcion_larga: null },
    ]);
  });
});
