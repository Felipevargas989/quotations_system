// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FiltrosDeLaBandeja from "./FiltrosDeLaBandeja";
import { FILTROS_DE_PARTIDA, type Filtros } from "./oportunidades.utils";

// LOS MONTONES Y LOS FILTROS DE LA BANDEJA (Felipe, 18-10: "vamos con las 5").

afterEach(cleanup);

const pintar = (filtros: Filtros = FILTROS_DE_PARTIDA) => {
  const onCambiar = vi.fn();
  render(
    <FiltrosDeLaBandeja
      filtros={filtros}
      onCambiar={onCambiar}
      porVista={{ nueva: 4, no_es_para_ti: 3, reciclaje: 7, descartada: 5 }}
      porSemaforo={{ verde: 1, amarillo: 3, rojo: 12, basura: 553 }}
      regiones={["Región del Biobío", "Región del Ñuble"]}
    />,
  );
  return onCambiar;
};

describe("FiltrosDeLaBandeja", () => {
  it("los montones son botones con su número, y el de partida es «Por revisar»", () => {
    pintar();
    expect(
      screen.getByRole("button", { name: /Por revisar\s*4/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Descartadas\s*5/ }),
    ).toHaveAttribute("aria-pressed", "false");
    // Lo que las bases dejan fuera, con su número (decisión 129).
    expect(
      screen.getByRole("button", { name: /No es para ti\s*3/ }),
    ).toHaveAttribute("aria-pressed", "false");
    // «Historial» es todo: va sin número.
    expect(
      screen.getByRole("button", { name: "Historial" }),
    ).toBeInTheDocument();
  });

  it("un clic cambia de montón", () => {
    const onCambiar = pintar();
    fireEvent.click(screen.getByRole("button", { name: /Descartadas/ }));
    expect(onCambiar).toHaveBeenCalledWith({ vista: "descartada" });
  });

  it("el tipo se elige con botones", () => {
    const onCambiar = pintar();
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Compras ágiles" }));
    expect(onCambiar).toHaveBeenCalledWith({ tipo: "compra_agil" });
  });

  it("en «Por revisar» el reciclaje es un montón con su número y no un chip (decisión 131)", () => {
    pintar();
    expect(
      screen.getByRole("button", { name: /^Reciclaje\s*7$/ }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("button", { name: "Reciclaje 12" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verdes 1" }),
    ).toBeInTheDocument();
  });

  it("en los otros montones el rojo es el reciclaje y se porta como el verde y el amarillo; la basura no tiene botón (decisión 72, 23-10)", () => {
    // Felipe: "gris lo eliminaría; rojo que sea igual en comportamiento al
    // verde y amarillo".
    const onCambiar = pintar({ ...FILTROS_DE_PARTIDA, vista: "descartada" });
    const reciclaje = screen.getByRole("button", { name: "Reciclaje 12" });
    expect(reciclaje).toHaveAttribute("aria-pressed", "true");
    expect(reciclaje).toHaveAttribute(
      "title",
      expect.stringContaining("de tu zona y de tu rubro"),
    );
    expect(screen.queryByText(/ocultas/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Basura/ })).toBeNull();
    fireEvent.click(reciclaje);
    expect(onCambiar).toHaveBeenCalledWith({
      semaforos: ["verde", "amarillo"],
    });
  });
});
