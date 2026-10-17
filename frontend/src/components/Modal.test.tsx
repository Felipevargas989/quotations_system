// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Modal from "./Modal";

// EL MODAL DE LA CASA: lo que guarda para todas las ventanas (Escape, el
// clic en el fondo que no cierra al arrastrar desde adentro) y, desde el
// 17-10, la ventana al costado (el resumen de una licitación).

afterEach(cleanup);

const pintar = (props: Partial<Parameters<typeof Modal>[0]> = {}) => {
  const onCerrar = vi.fn();
  render(
    <Modal titulo="Resumen" onCerrar={onCerrar} {...props}>
      <p>Contenido</p>
    </Modal>,
  );
  return onCerrar;
};

describe("Modal", () => {
  it("Escape cierra; con bloquearEscape, no", () => {
    const onCerrar = pintar();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    cleanup();
    const otro = pintar({ bloquearEscape: true });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(otro).not.toHaveBeenCalled();
  });

  it("el clic en el fondo cierra; adentro, no", () => {
    const onCerrar = pintar();
    fireEvent.mouseDown(screen.getByText("Contenido"));
    expect(onCerrar).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement as Element);
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("al costado: alto completo, pegada a la derecha, con el ✕ a la vista", () => {
    const onCerrar = pintar({ lado: "derecha" });
    const ventana = screen.getByRole("dialog");
    expect(ventana.className).toContain("h-full");
    expect(ventana.parentElement?.className).toContain("justify-end");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
