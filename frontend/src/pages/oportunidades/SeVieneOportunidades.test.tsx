// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/seViene.service";
import type { SeViene } from "../../services/seViene.service";
import SeVieneOportunidades from "./SeVieneOportunidades";

// «SE VIENE» CON EL SEMÁFORO DE LA BANDEJA (decisión 62, 20-10). Felipe:
// "deberíamos filtrar con el mismo semáforo, no tiene sentido analizar 400
// opciones".

vi.mock("../../services/seViene.service", () => ({
  getCalendario: vi.fn(),
  getLecturaDelCalendario: vi.fn(),
}));
vi.mock("./Ganadores", () => ({ default: () => null }));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const serie = (
  codigo: string,
  nombre: string,
  semaforo: SeViene["semaforo"],
  extra: Partial<SeViene> = {},
): SeViene => ({
  nombre,
  organismo: "ILUSTRE MUNICIPALIDAD DE QUILLON",
  comuna: "Quillón",
  esperada: "2026-11-10T12:00:00.000Z",
  atrasada: false,
  anios: [2025],
  comuna_cercana: false,
  alto_valor: false,
  ultima: {
    codigo,
    fecha_publicacion: "2025-11-10T12:00:00.000Z",
    monto: 17_000_000,
    oferentes: 1,
    ganadores: [],
  },
  semaforo,
  razon: semaforo ? `Razón de ${nombre}.` : null,
  ...extra,
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SeVieneOportunidades />
    </QueryClientProvider>,
  );

describe("Se viene con el semáforo", () => {
  it("se ven las verdes y amarillas; las rojas solo si se piden", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde", {
        comuna_cercana: true,
        alto_valor: true,
      }),
      serie("1057432-59-LE25", "Servicio de coffee break", "amarillo"),
      serie("2410-147-L125", "Insumos para procedimientos", "rojo"),
    ]);
    pintar();
    expect(
      await screen.findByText("Día de campo del dirigente"),
    ).toBeInTheDocument();
    expect(screen.getByText("Servicio de coffee break")).toBeInTheDocument();
    expect(
      screen.queryByText("Insumos para procedimientos"),
    ).not.toBeInTheDocument();
    // La razón de la IA y la prioridad en violeta, sin el amarillo.
    expect(
      screen.getByText("Razón de Día de campo del dirigente."),
    ).toBeInTheDocument();
    expect(screen.getByText("Comuna cercana")).toHaveClass("bg-violet-50");
    expect(screen.queryByText("Prioridad")).not.toBeInTheDocument();
    // Nada que leer: no pregunta cómo va.
    expect(s.getLecturaDelCalendario).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Ver también las rojas (1)"));
    expect(screen.getByText("Insumos para procedimientos")).toBeInTheDocument();
  });

  it("mientras la IA lee, lo sin leer no se ve y dice cómo va", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde"),
      serie("2410-147-L125", "Insumos para procedimientos", null),
    ]);
    s.getLecturaDelCalendario.mockResolvedValue({
      leyendo: true,
      leidas: 3,
      total: 10,
    });
    pintar();
    expect(await screen.findByText(/van 3 de 10/)).toBeInTheDocument();
    expect(
      screen.queryByText("Insumos para procedimientos"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Día de campo del dirigente")).toBeInTheDocument();
  });

  it("al terminar de leer pide el calendario otra vez, y lo que quedó sin leer se ve sin color", async () => {
    s.getCalendario
      .mockResolvedValueOnce([
        serie("2410-147-L125", "Insumos para procedimientos", null),
        serie("5040-25-LE25", "Día de campo del dirigente", null),
      ])
      .mockResolvedValue([
        serie("2410-147-L125", "Insumos para procedimientos", null),
        serie("5040-25-LE25", "Día de campo del dirigente", "verde"),
      ]);
    s.getLecturaDelCalendario
      .mockResolvedValueOnce({ leyendo: true, leidas: 1, total: 2 })
      .mockResolvedValue({ leyendo: false, leidas: 0, total: 0 });
    pintar();
    expect(
      await screen.findByText(
        "Día de campo del dirigente",
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    expect(s.getCalendario).toHaveBeenCalledTimes(2);
    const sinLeer = await screen.findByText("Insumos para procedimientos");
    expect(sinLeer.closest("li")).toHaveAttribute("data-semaforo", "sin_leer");
    expect(screen.getByText(/no pudo leerla todavía/)).toBeInTheDocument();
  }, 10000);
});
