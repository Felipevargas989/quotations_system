// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as postulacion from "../../services/postulacion.service";
import CaminoDePostulacion from "./CaminoDePostulacion";

// EL CAMINO DE LA POSTULACIÓN (Felipe, 17-10: "vamos con todas"): los pasos
// con lo hecho marcado. Solo la línea de tiempo desde el 20-10 (Felipe:
// "creo que ese botón no suma"; "deja solamente la línea de tiempo").

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
  getEstadoDeTraer: vi.fn(() => Promise.resolve({ trayendo: false })),
}));
vi.mock("../../services/postulacion.service", () => ({
  getOfertaDeLaPostulacion: vi.fn(() => Promise.resolve(null)),
}));

afterEach(cleanup);

describe("CaminoDePostulacion", () => {
  it("solo la línea de tiempo: los pasos, sin botón ni frase", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CaminoDePostulacion oportunidadId={40} estado="en_estudio" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Anexos")).toBeInTheDocument();
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
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Pon el precio y que la IA arme la postulación/),
    ).not.toBeInTheDocument();
  });

  it("mientras la IA arma «1. Qué ofreces», Anexos gira (23-10)", async () => {
    // Felipe: "por qué anexos ahí no se queda pensando?".
    vi.mocked(postulacion.getOfertaDeLaPostulacion).mockResolvedValueOnce({
      estado: "procesando",
    } as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CaminoDePostulacion oportunidadId={40} estado="en_estudio" />
      </QueryClientProvider>,
    );
    await screen.findByText((_, el) =>
      Boolean(
        el?.tagName === "SPAN" &&
          el.textContent === "Anexos" &&
          el.querySelector(".animate-spin"),
      ),
    );
  });
});
