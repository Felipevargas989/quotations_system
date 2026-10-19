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
import * as servicio from "../../services/oportunidades.service";
import ResumenDeNegocio from "./ResumenDeNegocio";

// EL RESUMEN DE NEGOCIO (decisión 30, sprint E, 19-10). Los servicios van
// de mentira.

vi.mock("../../services/oportunidades.service", () => ({
  getResumenDeNegocio: vi.fn(),
  pedirResumenDeNegocio: vi.fn(),
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TRABAJO = {
  id: 12,
  tipo: "resumen" as const,
  estado: "listo" as const,
  resultado: {
    resumen:
      "Gira de estudio a Pucón para 45 alumnos; la ganó Turismo del Sur.",
    quien_gano: "TURISMO DEL SUR LIMITADA (76.123.456-7) por $56.034.300 neto",
    que_incluye: ["Pucón, 5 días", "45 alumnos y 3 profesores"],
    ofertas: [
      {
        proveedor: "TURISMO DEL SUR LIMITADA",
        precio: "$56.034.300 neto",
        que_ofrecio: "Bus y alojamiento",
        gano: true,
      },
      {
        proveedor: "VIAJES ANDINOS SPA",
        precio: "$61.500.000 neto",
        que_ofrecio: "Programa en Pucón",
        gano: false,
      },
    ],
    para_tu_empresa: [
      "Ofrecerle a Turismo del Sur una parada con almuerzo en Quillón.",
    ],
    siguientes_pasos: ["Llamar a Turismo del Sur esta semana."],
  },
  archivos: [],
  no_leidos: [],
  modelo: "claude-sonnet-5-5",
  tokens_entrada: 20_000,
  tokens_salida: 1_500,
  costo_usd: 0.055,
  error: null,
  creado_en: "2026-11-05T13:00:00Z",
  terminado_en: "2026-11-05T13:01:00Z",
};

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ResumenDeNegocio oportunidadId={274} />
    </QueryClientProvider>,
  );

describe("Resumen de negocio", () => {
  it("sin resumen, se pide; mientras la IA escribe, lo dice", async () => {
    s.getResumenDeNegocio.mockResolvedValue(null);
    s.pedirResumenDeNegocio.mockResolvedValue({
      ...TRABAJO,
      estado: "procesando",
      resultado: null,
    } as never);
    pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: /Hacer resumen de negocio/ }),
    );
    await waitFor(() =>
      expect(s.pedirResumenDeNegocio).toHaveBeenCalledWith(274),
    );
    expect(
      await screen.findByText(/La IA está escribiendo el resumen/),
    ).toBeInTheDocument();
  });

  it("listo: quién ganó, qué incluye, qué ofreció cada uno, qué le sirve a tu empresa y los pasos", async () => {
    s.getResumenDeNegocio.mockResolvedValue(TRABAJO as never);
    pintar();
    expect(
      await screen.findByText(
        "TURISMO DEL SUR LIMITADA (76.123.456-7) por $56.034.300 neto",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Pucón, 5 días")).toBeInTheDocument();
    expect(screen.getByText("Ganó")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ofrecerle a Turismo del Sur una parada con almuerzo en Quillón.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Llamar a Turismo del Sur esta semana."),
    ).toBeInTheDocument();
    expect(screen.getByText("Costó US$0,055.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Volver a hacer/ }),
    ).toBeInTheDocument();
  });

  it("si falló, lo dice con el error de la casa", async () => {
    s.getResumenDeNegocio.mockResolvedValue({
      ...TRABAJO,
      estado: "error",
      resultado: null,
      error: "Se acabó el saldo de la cuenta de Anthropic.",
    } as never);
    pintar();
    expect(
      await screen.findByText("Se acabó el saldo de la cuenta de Anthropic."),
    ).toBeInTheDocument();
  });
});
