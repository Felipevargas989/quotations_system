// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CaminoDePostulacion from "./CaminoDePostulacion";

// EL CAMINO DE LA POSTULACIÓN (Felipe, 17-10: "vamos con todas"): los pasos
// con lo hecho marcado y el botón al que sigue, que lleva a su pestaña.

vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn((_id: number, seccion: string) =>
    Promise.resolve(
      seccion === "bases"
        ? [{ id: 1, nombre: "Bases.pdf", origen: "subido" }]
        : [],
    ),
  ),
  getAnalisis: vi.fn(() =>
    Promise.resolve({ id: 5, estado: "listo", resultado: null }),
  ),
  getValidacion: vi.fn(() => Promise.resolve(null)),
  getGeneraciones: vi.fn(() =>
    Promise.resolve({ anexos: null, firma: null, propuesta: null }),
  ),
}));

afterEach(cleanup);

describe("CaminoDePostulacion", () => {
  it("con bases y análisis listos, el que sigue es generar anexos y lleva a «Mi postulación»", async () => {
    const onIr = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CaminoDePostulacion
          oportunidadId={40}
          estado="en_estudio"
          onIr={onIr}
        />
      </QueryClientProvider>,
    );
    const boton = await screen.findByRole("button", {
      name: /Armar postulación/,
    });
    expect(
      screen.getByText(
        "Pon el precio y que la IA arme la postulación: la oferta, los anexos y la propuesta.",
      ),
    ).toBeInTheDocument();
    for (const paso of [
      "Bases",
      "Análisis",
      "Anexos",
      "Firma",
      "Validación",
      "Postulada",
    ]) {
      expect(screen.getByText(paso)).toBeInTheDocument();
    }
    fireEvent.click(boton);
    expect(onIr).toHaveBeenCalledWith("postulacion");
  });
});
