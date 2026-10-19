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
      porVista={{ nueva: 4, descartada: 5 }}
      porSemaforo={{ verde: 1, amarillo: 3, rojo: 265 }}
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

  it("el semáforo sigue igual: las rojas apagadas dicen que están ocultas, y un clic las enciende", () => {
    const onCambiar = pintar();
    fireEvent.click(
      screen.getByRole("button", { name: /Rojas 265 · ocultas/ }),
    );
    expect(onCambiar).toHaveBeenCalledWith({
      semaforos: ["verde", "amarillo", "rojo"],
    });
  });
});
