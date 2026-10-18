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
  estado: "pendiente" as const,
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
      [[conRudel], "puede_seguir"],
      [[conRudel], "gestionar"],
    ]);
    expect(alAbrirFicha).not.toHaveBeenCalled();
  });

  it("después de «Hay que gestionar» queda la viñeta «Tope de calendario» con un solo botón: «Sí, puede seguir»", () => {
    const onDecidir = vi.fn();
    const tope = { ...conRudel, estado: "gestionar" as const };
    render(
      <AvisoDeChoque
        choques={[tope]}
        puedeDecidir
        decidiendo={null}
        onDecidir={onDecidir}
      />,
    );
    const vineta = screen.getByText("Tope de calendario");
    expect(vineta).toHaveAttribute(
      "title",
      expect.stringContaining(
        "Con la N° 500 · Rudel S.A. · aceptada, 09-11 al 22-11",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Hay que gestionar" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sí, puede seguir" }));
    expect(onDecidir).toHaveBeenCalledWith([tope], "puede_seguir");
  });

  it("dos o tres topes se ven como UNA sola viñeta, y «Sí, puede seguir» los cierra todos", () => {
    const onDecidir = vi.fn();
    const con411 = {
      ...conRudel,
      quotation_id: "q475",
      quotation_number: 475,
      estado: "gestionar" as const,
      aceptada: {
        ...conRudel.aceptada,
        id: "q411",
        numero: 411,
        cliente: "Ferrocarril del Pacífico S.A",
        desde: "2026-12-20",
        hasta: "2026-12-20",
      },
    };
    const con412 = {
      ...con411,
      aceptada: { ...con411.aceptada, id: "q412", numero: 412 },
    };
    render(
      <AvisoDeChoque
        compacto
        choques={[con411, con412]}
        puedeDecidir
        decidiendo={null}
        onDecidir={onDecidir}
      />,
    );
    expect(screen.getAllByText("Tope de calendario")).toHaveLength(1);
    const titulo = screen.getByText("Tope de calendario").getAttribute("title");
    expect(titulo).toContain("Con la N° 411");
    expect(titulo).toContain("Con la N° 412");
    fireEvent.click(screen.getByRole("button", { name: "Sí, puede seguir" }));
    expect(onDecidir).toHaveBeenCalledWith([con411, con412], "puede_seguir");
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
        decidiendo="q634"
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
