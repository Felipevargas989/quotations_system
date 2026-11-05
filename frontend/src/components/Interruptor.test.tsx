// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Interruptor from "./Interruptor";

// EL INTERRUPTOR DE LA CASA (doc 22): se mueve con un toque, con Espacio y
// con Enter; con candado, no se mueve.

afterEach(cleanup);

const pintar = (props: Partial<Parameters<typeof Interruptor>[0]> = {}) => {
  const onCambiar = vi.fn();
  render(
    <Interruptor
      prendido={false}
      etiqueta="Cotizaciones de Recepción"
      onCambiar={onCambiar}
      {...props}
    />,
  );
  return { onCambiar, boton: screen.getByRole("switch") };
};

describe("Interruptor", () => {
  it("dice si está prendido y cómo se llama", () => {
    const { boton } = pintar({ prendido: true });
    expect(boton).toHaveAttribute("aria-checked", "true");
    expect(boton).toHaveAccessibleName("Cotizaciones de Recepción");
  });

  it("un toque lo cambia al revés de como está", async () => {
    const { onCambiar, boton } = pintar({ prendido: true });
    await userEvent.click(boton);
    expect(onCambiar).toHaveBeenCalledWith(false);
  });

  it("Espacio y Enter lo mueven", async () => {
    const { onCambiar, boton } = pintar();
    boton.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{Enter}");
    expect(onCambiar).toHaveBeenCalledTimes(2);
    expect(onCambiar).toHaveBeenCalledWith(true);
  });

  it("con candado no se mueve y dice por qué", async () => {
    const { onCambiar, boton } = pintar({
      candado: true,
      motivo: "No está incluido en tu plan",
    });
    await userEvent.click(boton);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(boton).toBeDisabled();
    expect(boton.parentElement).toHaveAttribute(
      "title",
      "No está incluido en tu plan",
    );
  });

  it("mientras guarda no acepta otro toque", async () => {
    const { onCambiar, boton } = pintar({ ocupado: true });
    await userEvent.click(boton);
    expect(onCambiar).not.toHaveBeenCalled();
  });
});
