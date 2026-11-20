// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DesdeQueDiaParte from "./DesdeQueDiaParte";

// «¿DESDE QUÉ DÍA PARTE?» (Felipe, 20-11-2026): el Día 1 viene marcado,
// el selector trae los días del evento con su rótulo, «Cargar» devuelve
// el paquete y el día elegido, y «Cancelar» no carga nada.

afterEach(cleanup);

const paquete = { id: 7, name: "Sernatur: programa 5 días" };
const rotulo = (n: number) => `Día ${n} · rótulo`;

const montar = (p: typeof paquete | null = paquete) => {
  const onCargar = vi.fn();
  const onCerrar = vi.fn();
  render(
    <DesdeQueDiaParte
      paquete={p}
      diasDelEvento={13}
      rotuloDeDia={rotulo}
      onCargar={onCargar}
      onCerrar={onCerrar}
    />,
  );
  return { onCargar, onCerrar };
};

describe("DesdeQueDiaParte", () => {
  it("sin paquete no dibuja nada", () => {
    montar(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pregunta por el paquete, con el Día 1 marcado y la línea de ayuda", () => {
    montar();
    expect(
      screen.getByText("¿Desde qué día parte «Sernatur: programa 5 días»?"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Día en que parte el paquete"),
    ).toHaveTextContent("Día 1 · rótulo");
    expect(
      screen.getByText(/Día 1 = junto con lo que ya está/),
    ).toBeInTheDocument();
  });

  it("«Cargar» con el Día 1 lo carga desde el día 1", () => {
    const { onCargar, onCerrar } = montar();
    fireEvent.click(screen.getByText("Cargar"));
    expect(onCargar).toHaveBeenCalledWith(paquete, 1);
    expect(onCerrar).toHaveBeenCalled();
  });

  it("eligiendo el día 8, «Cargar» lo carga desde el día 8", () => {
    const { onCargar } = montar();
    fireEvent.click(screen.getByLabelText("Día en que parte el paquete"));
    expect(screen.getAllByText(/^Día \d+ · rótulo$/)).toHaveLength(13 + 1);
    fireEvent.click(screen.getByText("Día 8 · rótulo"));
    fireEvent.click(screen.getByText("Cargar"));
    expect(onCargar).toHaveBeenCalledWith(paquete, 8);
  });

  it("«Cancelar» no carga nada", () => {
    const { onCargar, onCerrar } = montar();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onCargar).not.toHaveBeenCalled();
    expect(onCerrar).toHaveBeenCalled();
  });
});
