// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BandejaVacia as Caso } from "./bandeja";
import BandejaVacia from "./BandejaVacia";

// LA BANDEJA VACÍA QUE SIRVE (Felipe, 17-10, con «Verdes 0, Amarillas 0»).

afterEach(cleanup);

const pintar = (
  caso: Caso,
  extra: { rojas?: number; enCurso?: number } = {},
) => {
  const acciones = {
    onVerRojas: vi.fn(),
    onQuitarFiltros: vi.fn(),
    onIrAMisLicitaciones: vi.fn(),
  };
  render(
    <BandejaVacia
      caso={caso}
      vista="nueva"
      proxima="02:07"
      rojas={extra.rojas ?? 0}
      enCurso={extra.enCurso ?? 0}
      {...acciones}
    />,
  );
  return acciones;
};

describe("BandejaVacia", () => {
  it("al día: lo dice, con la hora de la próxima pasada y un clic a «Mis licitaciones»", () => {
    const { onIrAMisLicitaciones } = pintar("al_dia", { enCurso: 2 });
    expect(screen.getByText("Revisaste todo lo nuevo")).toBeInTheDocument();
    expect(
      screen.getByText(/próxima pasada del radar es a las 02:07/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Tus 2 marcadas están en «Mis licitaciones»",
      }),
    );
    expect(onIrAMisLicitaciones).toHaveBeenCalled();
  });

  it("las rojas escondidas quedan a un clic", () => {
    const { onVerRojas } = pintar("al_dia", { rojas: 265 });
    fireEvent.click(screen.getByRole("button", { name: /Ver las 265 rojas/ }));
    expect(onVerRojas).toHaveBeenCalled();
  });

  it("sin marcadas ni rojas, no ofrece lo que no hay", () => {
    pintar("al_dia");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("con filtros que esconden todo: ofrece quitarlos", () => {
    const { onQuitarFiltros } = pintar("con_filtros");
    expect(screen.getByText("Nada con estos filtros")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(onQuitarFiltros).toHaveBeenCalled();
  });

  it("sin nada leído todavía: cuándo vuelve a mirar el radar", () => {
    pintar("sin_datos");
    expect(
      screen.getByText(/la próxima pasada es a las 02:07/),
    ).toBeInTheDocument();
  });
});
