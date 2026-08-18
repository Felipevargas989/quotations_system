// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HoraInput, { normalizarHora } from "./HoraInput";

// EL RELOJ DE LA CASA (Felipe, 18-08): 24 h siempre, se teclea rápido y
// guarda UNA vez por edición. Estos tests fijan esas tres cosas.

afterEach(cleanup);

describe("normalizarHora", () => {
  it("lee lo que se teclea rápido y lo deja en HH:MM de 24 h", () => {
    expect(normalizarHora("9")).toBe("09:00");
    expect(normalizarHora("22")).toBe("22:00");
    expect(normalizarHora("14")).toBe("14:00");
    expect(normalizarHora("930")).toBe("09:30");
    expect(normalizarHora("0930")).toBe("09:30");
    expect(normalizarHora("2200")).toBe("22:00");
    expect(normalizarHora("22:00")).toBe("22:00");
    expect(normalizarHora("9:5")).toBe("09:05");
    expect(normalizarHora("22.30")).toBe("22:30");
    expect(normalizarHora("22 30")).toBe("22:30");
    expect(normalizarHora("  7:45 ")).toBe("07:45");
    expect(normalizarHora("0")).toBe("00:00");
  });

  it("vacío es 'sin hora'", () => {
    expect(normalizarHora("")).toBeNull();
    expect(normalizarHora("   ")).toBeNull();
  });

  it("lo inválido no se guarda", () => {
    for (const t of ["24", "25", "1299", "960", "abc", "12345", "10pm", "-1"]) {
      expect(normalizarHora(t), t).toBeUndefined();
    }
  });
});

describe("HoraInput", () => {
  it("guarda UNA vez, al salir, con la hora normalizada", async () => {
    const onChange = vi.fn();
    render(<HoraInput value="09:00" onChange={onChange} aria-label="Entrada" />);
    const caja = screen.getByLabelText("Entrada");
    await userEvent.clear(caja);
    await userEvent.type(caja, "2200");
    expect(onChange).not.toHaveBeenCalled(); // mientras se escribe, nada
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("22:00");
    expect(caja).toHaveValue("22:00");
  });

  it("Enter también confirma", async () => {
    const onChange = vi.fn();
    render(<HoraInput value={null} onChange={onChange} aria-label="Salida" />);
    const caja = screen.getByLabelText("Salida");
    await userEvent.type(caja, "1430{Enter}");
    expect(onChange).toHaveBeenCalledWith("14:30");
  });

  it("algo inválido vuelve a la hora anterior y no guarda", async () => {
    const onChange = vi.fn();
    render(<HoraInput value="09:00" onChange={onChange} aria-label="Entrada" />);
    const caja = screen.getByLabelText("Entrada");
    await userEvent.clear(caja);
    await userEvent.type(caja, "25");
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(caja).toHaveValue("09:00");
  });

  it("la misma hora no se vuelve a guardar", async () => {
    const onChange = vi.fn();
    render(<HoraInput value="09:00" onChange={onChange} aria-label="Entrada" />);
    const caja = screen.getByLabelText("Entrada");
    await userEvent.clear(caja);
    await userEvent.type(caja, "9");
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(caja).toHaveValue("09:00");
  });

  it("Escape descarta lo escrito", async () => {
    const onChange = vi.fn();
    render(<HoraInput value="09:00" onChange={onChange} aria-label="Entrada" />);
    const caja = screen.getByLabelText("Entrada");
    await userEvent.clear(caja);
    await userEvent.type(caja, "18{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(caja).toHaveValue("09:00");
  });

  it("si la hora cambia por fuera, la caja la sigue", () => {
    const { rerender } = render(
      <HoraInput value="09:00" onChange={vi.fn()} aria-label="Entrada" />,
    );
    rerender(<HoraInput value="10:00" onChange={vi.fn()} aria-label="Entrada" />);
    expect(screen.getByLabelText("Entrada")).toHaveValue("10:00");
  });
});
