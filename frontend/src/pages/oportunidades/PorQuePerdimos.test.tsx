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
import * as comparacion from "../../services/comparacion.service";
import PorQuePerdimos from "./PorQuePerdimos";

// POR QUÉ PERDIMOS (decisión 97, 27-10). Felipe: "abajo está la predicción
// y luego está el por qué perdimos y si el haber perdido era razonable o
// no".

vi.mock("../../services/comparacion.service", () => ({
  getPorQue: vi.fn(),
  pedirPorQue: vi.fn(),
}));
const c = vi.mocked(comparacion);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PorQuePerdimos oportunidadId={3219} />
    </QueryClientProvider>,
  );

const trabajo = (razonable: "si" | "no" | "dudoso") =>
  ({
    id: 70,
    oportunidad_id: 3219,
    tipo: "por_que",
    estado: "listo",
    resultado: {
      resumen: "Eligieron a BPM porque cotizó $290.000 menos.",
      razonable,
      fundamento: "Con el criterio de la ley gana la más económica.",
      en_que_se_perdio: [
        { criterio: "Menor precio", que_paso: "BPM cotizó $6.800.000." },
      ],
      para_la_proxima: ["Bajar el precio de las colaciones."],
    },
    archivos: [],
    no_leidos: [],
    modelo: "claude-opus-5-5",
    costo_usd: 0.4,
    error: null,
    creado_en: "2026-10-27T23:40:00.000Z",
    terminado_en: "2026-10-27T23:43:00.000Z",
  }) as unknown as comparacion.TrabajoDePorQue;

describe("Por qué perdiste (decisión 97)", () => {
  it("dice por qué, si era razonable, en qué criterio y qué hacer distinto", async () => {
    c.getPorQue.mockResolvedValue(trabajo("si"));
    pintar();
    expect(
      await screen.findByText("Eligieron a BPM porque cotizó $290.000 menos."),
    ).toBeInTheDocument();
    expect(screen.getByText("Era razonable perder")).toBeInTheDocument();
    expect(screen.getByText("Menor precio:")).toBeInTheDocument();
    expect(
      screen.getByText("Bajar el precio de las colaciones."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Volver a explicar");
  });

  it("si no era razonable, lo dice en rojo", async () => {
    c.getPorQue.mockResolvedValue(trabajo("no"));
    pintar();
    expect(await screen.findByText("No era razonable perder")).toHaveClass(
      "text-red-800",
    );
  });

  it("sin explicación todavía, se puede pedir", async () => {
    c.getPorQue.mockResolvedValue(null);
    c.pedirPorQue.mockResolvedValue({
      ...trabajo("si"),
      estado: "procesando",
      resultado: null,
    });
    pintar();
    const boton = await screen.findByRole("button", {
      name: /Explicar por qué perdimos/,
    });
    fireEvent.click(boton);
    await waitFor(() => expect(c.pedirPorQue).toHaveBeenCalledWith(3219));
    expect(
      await screen.findByText(/La IA está leyendo las ofertas/),
    ).toBeInTheDocument();
  });
});
