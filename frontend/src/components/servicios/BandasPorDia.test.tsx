// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import BandasPorDia from "./BandasPorDia";
import type { Resaltar } from "../../utils/serviciosPorDia";

// LAS BANDAS POR DÍA (20-11-2026): con un día la lista queda como antes;
// con varios, una banda por día con sus comidas, su total, plegar y
// «+ Agregar al Día N».

afterEach(cleanup);

type Caja = { id: string; day: number; cat: string; total: number };
const cajas: Caja[] = [
  { id: "a", day: 1, cat: "Sernatur - almuerzo", total: 10000 },
  { id: "b", day: 2, cat: "Sernatur - desayuno", total: 5000 },
  { id: "c", day: 1, cat: "Almuerzos & Cenas", total: 2500 },
  { id: "d", day: 1, cat: "Extras", total: 0 },
];

const pintar = (
  dias: number,
  extra: Partial<Parameters<typeof BandasPorDia<Caja>>[0]> = {},
) =>
  render(
    <BandasPorDia
      cajas={cajas}
      diasDelEvento={dias}
      fechaInicio="2026-11-22"
      diaDe={(c) => c.day}
      categoriaDe={(c) => c.cat}
      totalDe={(c) => c.total}
      className="lista"
      pie={<button type="button">+ Agregar servicio</button>}
      {...extra}
    >
      {cajas.map((c) => (
        <div key={c.id} data-testid={`caja-${c.id}`}>
          {c.cat}
        </div>
      ))}
    </BandasPorDia>,
  );

describe("BandasPorDia", () => {
  it("con un día dibuja la lista de siempre, sin bandas", () => {
    const { container } = pintar(1);
    expect(screen.queryByText("Plegar todos los días")).toBeNull();
    expect(screen.queryByText("Día 1")).toBeNull();
    const lista = container.firstChild as HTMLElement;
    expect(lista).toHaveClass("lista");
    expect(
      [...lista.children].map((n) => n.getAttribute("data-testid") ?? "pie"),
    ).toEqual(["caja-a", "caja-b", "caja-c", "caja-d", "pie"]);
  });

  it("con varios días agrupa por día, con fecha, comidas y total", () => {
    pintar(3);
    const dia1 = screen.getByRole("region", { name: "Día 1" });
    expect(within(dia1).getByText("domingo 22-11")).toBeInTheDocument();
    // la ambigua llena la cena porque el almuerzo ya está
    expect(within(dia1).getByText("✓ Almuerzo")).toBeInTheDocument();
    expect(within(dia1).getByText("✓ Cena")).toBeInTheDocument();
    expect(within(dia1).getByText("falta Desayuno")).toBeInTheDocument();
    expect(within(dia1).getByText("falta Alojamiento")).toBeInTheDocument();
    expect(within(dia1).getByText("+ Extra")).toBeInTheDocument();
    expect(within(dia1).getByText(/3 casillas/)).toBeInTheDocument();
    expect(within(dia1).getByText("$12.500")).toBeInTheDocument();
    // dentro del día, el orden manual
    expect(
      within(dia1)
        .getAllByTestId(/caja-/)
        .map((n) => n.dataset.testid),
    ).toEqual(["caja-a", "caja-c", "caja-d"]);
    const dia3 = screen.getByRole("region", { name: "Día 3" });
    expect(
      within(dia3).getByText("Sin servicios este día."),
    ).toBeInTheDocument();
    expect(screen.getByText("+ Agregar servicio")).toBeInTheDocument();
  });

  it("pliega un día y todos los días", async () => {
    pintar(2);
    await userEvent.click(screen.getByRole("button", { name: /Día 2/ }));
    expect(screen.queryByTestId("caja-b")).toBeNull();
    expect(screen.getByTestId("caja-a")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Plegar todos los días"));
    expect(screen.queryByTestId("caja-a")).toBeNull();
    await userEvent.click(screen.getByText("Desplegar todos"));
    expect(screen.getByTestId("caja-a")).toBeInTheDocument();
    expect(screen.getByTestId("caja-b")).toBeInTheDocument();
  });

  it("«+ Agregar al Día N» avisa el día", async () => {
    const onAgregar = vi.fn();
    pintar(2, { onAgregar });
    await userEvent.click(screen.getByText("+ Agregar al Día 2"));
    expect(onAgregar).toHaveBeenCalledWith(2);
  });

  it("sin onAgregar no ofrece agregar por día", () => {
    pintar(2);
    expect(screen.queryByText(/Agregar al Día/)).toBeNull();
  });

  it("al cambiar de día, despliega la banda e ilumina la casilla", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = pintar(2);
    await userEvent.click(screen.getByRole("button", { name: /Día 2/ }));
    expect(screen.queryByTestId("caja-b")).toBeNull();
    const resaltar: Resaltar = { indice: 1, vez: 1 };
    rerender(
      <BandasPorDia
        cajas={cajas}
        diasDelEvento={2}
        fechaInicio="2026-11-22"
        diaDe={(c) => c.day}
        categoriaDe={(c) => c.cat}
        totalDe={(c) => c.total}
        resaltar={resaltar}
      >
        {cajas.map((c) => (
          <div key={c.id} data-testid={`caja-${c.id}`}>
            {c.cat}
          </div>
        ))}
      </BandasPorDia>,
    );
    const caja = screen.getByTestId("caja-b");
    expect(caja.parentElement).toHaveAttribute("data-iluminada", "si");
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(caja.parentElement).not.toHaveAttribute("data-iluminada");
    vi.useRealTimers();
  });
});
