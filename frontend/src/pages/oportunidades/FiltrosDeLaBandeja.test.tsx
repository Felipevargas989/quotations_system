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

  it("el rojo es el reciclaje y la basura va aparte: los dos parten ocultos, y un clic los enciende (decisión 72)", () => {
    // Felipe, 23-10: "el rojo puede ser reciclaje... y otras que estén
    // sencillamente descartadas porque no son".
    const onCambiar = pintar();
    const reciclaje = screen.getByRole("button", {
      name: /Reciclaje 12 · ocultas/,
    });
    expect(reciclaje).toHaveAttribute(
      "title",
      expect.stringContaining("de tu zona y de tu rubro"),
    );
    fireEvent.click(reciclaje);
    expect(onCambiar).toHaveBeenCalledWith({
      semaforos: ["verde", "amarillo", "rojo"],
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Basura 553 · ocultas/ }),
    );
    expect(onCambiar).toHaveBeenLastCalledWith({
      semaforos: ["verde", "amarillo", "basura"],
    });
  });
});
