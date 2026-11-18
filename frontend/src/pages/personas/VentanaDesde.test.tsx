// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/people.service";
import type { Persona } from "../../types/people.types";
import { hoyEnChile } from "../../utils/dates";
import HistorialDeTipo from "./HistorialDeTipo";
import VentanaDesde from "./VentanaDesde";

// LA VENTANA «DESDE» Y EL HISTORIAL DE TIPO (doc 10 §12, 17-11-2026).
// Felipe: "la ventana desde desarrollemos en el laboratorio".

vi.mock("../../services/people.service", () => ({
  getPreviaDelTipo: vi.fn(),
  cambiarTipo: vi.fn(),
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sofia = {
  id: 19,
  name: "Sofía",
  default_kind: "freelance",
  historial_tipo: [],
} as unknown as Persona;

const abrir = (onCerrar = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VentanaDesde persona={sofia} kind="planta" onCerrar={onCerrar} />
    </QueryClientProvider>,
  );
  return onCerrar;
};

describe("VentanaDesde", () => {
  it("pregunta desde qué día, con hoy por defecto, y muestra qué pasa con sus días", async () => {
    s.getPreviaDelTipo.mockResolvedValue({
      kind: "planta",
      anterior: "freelance",
      desde: hoyEnChile(),
      futuro: false,
      aPlanta: 0,
      aFreelance: 0,
      quitan: 0,
      sinTocar: 0,
    });
    abrir();
    const fecha = screen.getByLabelText("Desde");
    expect(fecha).toHaveValue(hoyEnChile());
    expect(
      await screen.findByText(
        "Desde hoy, el sistema le carga sus días de planta.",
      ),
    ).toBeInTheDocument();
    expect(s.getPreviaDelTipo).toHaveBeenCalledWith(19, "planta", hoyEnChile());
    expect(
      screen.getByText("Los días de eventos no cambian."),
    ).toBeInTheDocument();
  });

  it("con una fecha pasada avisa cuántos días quedan sin tocar por estar en nómina, y confirma con esa fecha", async () => {
    s.getPreviaDelTipo.mockImplementation((_id, kind, desde) =>
      Promise.resolve({
        kind,
        anterior: "freelance",
        desde,
        futuro: false,
        aPlanta: desde === "2026-11-01" ? 9 : 0,
        aFreelance: 0,
        quitan: 0,
        sinTocar: desde === "2026-11-01" ? 2 : 0,
      }),
    );
    s.cambiarTipo.mockResolvedValue({
      kind: "planta",
      anterior: "freelance",
      desde: "2026-11-01",
      futuro: false,
      aPlanta: 9,
      aFreelance: 0,
      quitan: 0,
      sinTocar: 2,
    });
    const onCerrar = abrir();
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-11-01" },
    });
    expect(
      await screen.findByText("9 días de staff desde el 01-11 pasan a planta."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 días quedan sin tocar: ya están en una liquidación o nómina.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar a planta" }));
    await waitFor(() =>
      expect(s.cambiarTipo).toHaveBeenCalledWith(19, "planta", "2026-11-01"),
    );
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });

  it("si el motor dice que ya es de ese tipo, lo muestra y no deja confirmar", async () => {
    s.getPreviaDelTipo.mockRejectedValue(
      new Error("Ya es de planta el 01-11-2026"),
    );
    abrir();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Cambiar a planta" }),
      ).toBeDisabled(),
    );
    expect(s.cambiarTipo).not.toHaveBeenCalled();
  });
});

describe("HistorialDeTipo", () => {
  it("lista cada cambio con su fecha, quién lo registró y lo que todavía no rige", () => {
    render(
      <HistorialDeTipo
        persona={{
          historial_tipo: [
            {
              id: 1,
              kind: "planta",
              anterior: "freelance",
              desde: "2026-11-01",
              registrado_en: "2026-11-17T15:05:00Z",
              registrado_por_nombre: "Felipe",
            },
            {
              id: 2,
              kind: "freelance",
              anterior: "planta",
              desde: "2099-01-01",
              registrado_en: "2026-11-17T16:00:00Z",
              registrado_por_nombre: "Camila",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Historial de tipo")).toBeInTheDocument();
    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    // Lo más nuevo arriba: el pendiente de 2099.
    expect(filas[0]).toHaveTextContent("Freelance");
    expect(filas[0]).toHaveTextContent("Pendiente");
    expect(filas[0]).toHaveTextContent("registró Camila");
    expect(filas[1]).toHaveTextContent("Planta");
    expect(filas[1]).toHaveTextContent(/01 nov\.? 2026/);
    expect(filas[1]).toHaveTextContent("registró Felipe");
    expect(filas[1]).not.toHaveTextContent("Pendiente");
  });

  it("sin cambios, lo dice", () => {
    render(<HistorialDeTipo persona={{ historial_tipo: [] }} />);
    expect(screen.getByText("Sin cambios de tipo.")).toBeInTheDocument();
  });
});
