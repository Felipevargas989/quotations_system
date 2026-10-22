// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvisoDeChoque from "./AvisoDeChoque";

// El tope de calendario (Felipe, 18-10-2026; mapa 02 §5.6). Desde el primer
// momento es «Tope de calendario», con un solo «Sí, puede seguir»; el botón
// «Hay que gestionar» se quitó. Datos de prueba con las formas de los casos
// reales de ese día.

afterEach(cleanup);

const con411 = {
  quotation_id: "q475",
  quotation_number: 475,
  aceptada: {
    id: "q411",
    numero: 411,
    cliente: "Ferrocarril del Pacífico S.A",
    desde: "2026-12-20",
    hasta: "2026-12-20",
    exclusiva: false,
  },
};
const con412 = {
  ...con411,
  aceptada: { ...con411.aceptada, id: "q412", numero: 412, exclusiva: true },
};

describe("AvisoDeChoque", () => {
  it("sin topes no ocupa espacio", () => {
    const { container } = render(
      <AvisoDeChoque
        choques={[]}
        puedeDecidir
        guardando={false}
        onSeguir={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("en la tarjeta: una sola viñeta aunque sean dos topes, el detalle al pasar el mouse, y un solo botón que los cierra todos", () => {
    const onSeguir = vi.fn();
    const alAbrirFicha = vi.fn();
    render(
      <div onClick={alAbrirFicha}>
        <AvisoDeChoque
          compacto
          choques={[con411, con412]}
          puedeDecidir
          guardando={false}
          onSeguir={onSeguir}
        />
      </div>,
    );
    expect(screen.getAllByText("Tope de calendario")).toHaveLength(1);
    const titulo = screen.getByText("Tope de calendario").getAttribute("title");
    expect(titulo).toContain("Con la N° 411 · Ferrocarril del Pacífico S.A");
    expect(titulo).toContain("Con la N° 412");
    expect(titulo).toContain("con exclusividad");
    expect(
      screen.queryByRole("button", { name: "Hay que gestionar" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sí, puede seguir" }));
    expect(onSeguir).toHaveBeenCalledWith([con411, con412]);
    expect(alAbrirFicha).not.toHaveBeenCalled();
  });

  it("en la ficha: el detalle de cada tope a la vista, con la exclusividad", () => {
    render(
      <AvisoDeChoque
        choques={[con411, con412]}
        puedeDecidir
        guardando={false}
        onSeguir={vi.fn()}
      />,
    );
    const lineas = screen.getAllByRole("listitem");
    expect(lineas[0]).toHaveTextContent(
      "Choca con N° 411 · Ferrocarril del Pacífico S.A · aceptada, 20-12",
    );
    expect(lineas[1]).toHaveTextContent(
      "Choca con N° 412 · Ferrocarril del Pacífico S.A · aceptada, 20-12 · con exclusividad",
    );
    expect(
      screen.getAllByRole("button", { name: "Sí, puede seguir" }),
    ).toHaveLength(1);
  });

  it("quien no vende ve el tope pero no el botón", () => {
    render(
      <AvisoDeChoque
        compacto
        choques={[con411]}
        puedeDecidir={false}
        guardando={false}
        onSeguir={vi.fn()}
      />,
    );
    expect(screen.getByText("Tope de calendario")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("mientras se guarda, el botón se apaga", () => {
    render(
      <AvisoDeChoque
        compacto
        choques={[con411]}
        puedeDecidir
        guardando
        onSeguir={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sí, puede seguir" }),
    ).toBeDisabled();
  });
});
