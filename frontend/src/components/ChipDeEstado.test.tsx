// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChipDeEstado from "./ChipDeEstado";

// EL CHIP DE ESTADO: se abre hacia donde hay espacio (Felipe, 17-10: en
// «Mis licitaciones», pegado al borde izquierdo, la lista se cortaba).

const OPCIONES = [
  { value: "nueva", label: "Nueva", clases: "bg-blue-100" },
  { value: "en_estudio", label: "En estudio", clases: "bg-amber-100" },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const abrirEn = (left: number) => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left,
    right: left + 100,
    top: 0,
    bottom: 30,
    width: 100,
    height: 30,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
  render(
    <ChipDeEstado value="en_estudio" opciones={OPCIONES} onChange={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /En estudio/ }));
  return screen.getByRole("button", { name: "Nueva" }).parentElement!;
};

describe("ChipDeEstado", () => {
  it("en la mitad izquierda de la pantalla se abre hacia la derecha", () => {
    window.innerWidth = 1200;
    expect(abrirEn(80).className).toContain("left-0");
  });

  it("en la mitad derecha se abre hacia la izquierda, como antes", () => {
    window.innerWidth = 1200;
    expect(abrirEn(900).className).toContain("right-0");
  });

  it("elegir otro estado lo avisa y cierra la lista", () => {
    const onChange = vi.fn();
    render(
      <ChipDeEstado value="nueva" opciones={OPCIONES} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Nueva/ }));
    fireEvent.click(screen.getByRole("button", { name: "En estudio" }));
    expect(onChange).toHaveBeenCalledWith("en_estudio");
    expect(screen.queryByRole("button", { name: "En estudio" })).toBeNull();
  });
});
