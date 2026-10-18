// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvisoDeChoque from "./AvisoDeChoque";

// El aviso rojo de los choques de fecha (Felipe, 18-10-2026; mapa 02 §5.6).
// Datos de prueba con las formas de los casos reales de ese día.

afterEach(cleanup);

const conRudel = {
  quotation_id: "q634",
  quotation_number: 634,
  aceptada: {
    id: "q500",
    numero: 500,
    cliente: "Rudel S.A.",
    desde: "2026-11-09",
    hasta: "2026-11-22",
    exclusiva: false,
  },
};

describe("AvisoDeChoque", () => {
  it("sin choques no ocupa espacio", () => {
    const { container } = render(
      <AvisoDeChoque
        choques={[]}
        puedeDecidir
        decidiendo={null}
        onDecidir={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("dice con cuál choca y sus fechas; la exclusividad, en negrita", () => {
    render(
      <AvisoDeChoque
        choques={[
          conRudel,
          {
            ...conRudel,
            aceptada: {
              ...conRudel.aceptada,
              id: "q384",
              numero: 384,
              cliente: "Jabones Maritano",
              desde: "2026-11-27",
              hasta: "2026-11-27",
              exclusiva: true,
            },
          },
        ]}
        puedeDecidir
        decidiendo={null}
        onDecidir={vi.fn()}
      />,
    );
    const avisos = screen.getAllByRole("alert");
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toHaveTextContent(
      "Choca con N° 500 · Rudel S.A. · aceptada, 09-11 al 22-11",
    );
    expect(avisos[1]).toHaveTextContent(
      "Choca con N° 384 · Jabones Maritano · aceptada, 27-11 · con exclusividad",
    );
  });

  it("los dos botones deciden, sin abrir la ficha que lo contiene", () => {
    const onDecidir = vi.fn();
    const alAbrirFicha = vi.fn();
    render(
      <div onClick={alAbrirFicha}>
        <AvisoDeChoque
          compacto
          choques={[conRudel]}
          puedeDecidir
          decidiendo={null}
          onDecidir={onDecidir}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, puede seguir" }));
    fireEvent.click(screen.getByRole("button", { name: "Hay que gestionar" }));
    expect(onDecidir.mock.calls).toEqual([
      [conRudel, "puede_seguir"],
      [conRudel, "gestionar"],
    ]);
    expect(alAbrirFicha).not.toHaveBeenCalled();
  });

  it("quien no vende ve el aviso pero no los botones", () => {
    render(
      <AvisoDeChoque
        choques={[conRudel]}
        puedeDecidir={false}
        decidiendo={null}
        onDecidir={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("mientras se guarda una decisión, sus botones se apagan", () => {
    render(
      <AvisoDeChoque
        choques={[conRudel]}
        puedeDecidir
        decidiendo="q634|q500"
        onDecidir={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sí, puede seguir" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Hay que gestionar" }),
    ).toBeDisabled();
  });
});
