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
import * as servicio from "../../services/experiencia.service";
import type {
  CandidataDeExperiencia,
  TrabajoDeExperiencia,
} from "../../services/experiencia.service";
import LaExperiencia from "./LaExperiencia";

// «LA EXPERIENCIA» (decisión 76, 24-10): la IA propone según las bases y la
// empresa confirma cuáles van o pide otras. Felipe: "me puede preguntar
// cuál está pensando traer. Yo le confirmo si sí o si no".

vi.mock("../../services/experiencia.service", () => ({
  getExperiencia: vi.fn(),
  proponerExperiencia: vi.fn(),
  confirmarExperiencia: vi.fn(),
  guardarClientesQueSeMuestran: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const candidata = (
  clave: string,
  extra: Partial<CandidataDeExperiencia>,
): CandidataDeExperiencia => ({
  clave,
  de: "mi_empresa",
  con_respaldo: true,
  numero: clave.slice(3),
  mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
  contrato: "Arriendo de espacios y alimentación",
  anio: 2023,
  monto: 16_500_000,
  fuente: "mercado_publico",
  archivo: "OC.pdf",
  ...extra,
});

const trabajo = (
  resultado: Partial<TrabajoDeExperiencia["resultado"]> = {},
): TrabajoDeExperiencia =>
  ({
    id: 30,
    tipo: "experiencia",
    estado: "listo",
    error: null,
    creado_en: "2026-10-24T14:00:00.000Z",
    terminado_en: "2026-10-24T14:01:00.000Z",
    parametros: { excluir: ["ev:52"] },
    resultado: {
      pide: 2,
      periodo: "los últimos 4 años",
      condiciones: "Contratos similares con orden de compra o factura.",
      elegidas: [
        candidata("mp:4366-146-SE23", { por_que: "Arriendo y alimentación" }),
        candidata("ev:118", {
          de: "eventia",
          evento: 118,
          numero: "260",
          mandante: "Comercial CCU S.A.",
          contrato: "Paseo de fin de año",
          monto: 11_292_880,
        }),
        candidata("ev:140", {
          de: "eventia",
          evento: 140,
          numero: "F215",
          mandante: "Armada de Chile",
          monto: 8_552_684,
        }),
      ],
      faltan: [
        candidata("ev:236", {
          de: "eventia",
          evento: 236,
          con_respaldo: false,
          numero: null,
          mandante: "CCU",
          monto: 10_952_736,
          por_que: "Paseo para 271 personas",
        }),
      ],
      nota: "Con estas tienes el puntaje máximo.",
      ...resultado,
    },
  }) as TrabajoDeExperiencia;

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LaExperiencia oportunidadId={40} />
    </QueryClientProvider>,
  );

describe("La experiencia", () => {
  it("si las bases no la piden, no aparece", async () => {
    s.getExperiencia.mockResolvedValue({ piden: false, trabajo: null });
    const { container } = pintar();
    await waitFor(() => expect(s.getExperiencia).toHaveBeenCalledWith(40));
    expect(container).toBeEmptyDOMElement();
  });

  it("sin propuesta, se pide con un botón", async () => {
    s.getExperiencia.mockResolvedValue({ piden: true, trabajo: null });
    s.proponerExperiencia.mockResolvedValue({
      ...trabajo(),
      estado: "procesando",
      resultado: null,
    });
    pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: "Proponer experiencia" }),
    );
    await waitFor(() =>
      expect(s.proponerExperiencia).toHaveBeenCalledWith(40, []),
    );
    expect(
      await screen.findByText(/La IA está eligiendo tu experiencia/),
    ).toBeInTheDocument();
  });

  it("muestra lo que propone, con la reserva y las facturas que conviene subir; se confirma sin las que se sacan o se buscan otras", async () => {
    s.getExperiencia.mockResolvedValue({ piden: true, trabajo: trabajo() });
    s.confirmarExperiencia.mockResolvedValue(trabajo({ confirmada: true }));
    s.proponerExperiencia.mockResolvedValue({
      ...trabajo(),
      estado: "procesando",
      resultado: null,
    });
    pintar();
    expect(
      await screen.findByText(/Piden 2 contratos para el puntaje máximo/),
    ).toBeInTheDocument();
    expect(screen.getByText("Reserva")).toBeInTheDocument();
    expect(
      screen.getByText(/Te conviene subir la factura de estos eventos/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Evento N° 236 · CCU/)).toBeInTheDocument();

    const buscar = screen.getByRole("button", { name: "Buscar otras" });
    expect(buscar).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Va Comercial CCU S.A."));
    expect(buscar).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar sin las 1 que sacaste" }),
    );
    await waitFor(() =>
      expect(s.confirmarExperiencia).toHaveBeenCalledWith(40, ["ev:118"]),
    );
    expect(
      await screen.findByText("Confirmada: con esto se arma la postulación."),
    ).toBeInTheDocument();
  });

  it("«Buscar otras» deja fuera las que ya se sacaron", async () => {
    s.getExperiencia.mockResolvedValue({ piden: true, trabajo: trabajo() });
    s.proponerExperiencia.mockResolvedValue({
      ...trabajo(),
      estado: "procesando",
      resultado: null,
    });
    pintar();
    fireEvent.click(await screen.findByLabelText("Va Armada de Chile"));
    fireEvent.click(screen.getByRole("button", { name: "Buscar otras" }));
    await waitFor(() =>
      expect(s.proponerExperiencia).toHaveBeenCalledWith(40, [
        "ev:52",
        "ev:140",
      ]),
    );
  });

  it("confirmada, se puede cambiar", async () => {
    s.getExperiencia.mockResolvedValue({
      piden: true,
      trabajo: trabajo({ confirmada: true }),
    });
    s.proponerExperiencia.mockResolvedValue({
      ...trabajo(),
      estado: "procesando",
      resultado: null,
    });
    pintar();
    expect(
      await screen.findByText("Confirmada: con esto se arma la postulación."),
    ).toBeInTheDocument();
    // Sin casillas: ya está decidida.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    await waitFor(() =>
      expect(s.proponerExperiencia).toHaveBeenCalledWith(40, []),
    );
  });
});
