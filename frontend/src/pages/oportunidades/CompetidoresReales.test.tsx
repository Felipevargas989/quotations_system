// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/competencia.service";
import type {
  CompetidorReal,
  EstadoDeLaCompetencia,
} from "../../services/competencia.service";
import CompetidoresReales from "./CompetidoresReales";

// «TUS COMPETIDORES» (decisión 70, 22-10). Felipe: "podemos hacerle
// seguimiento a las empresas con las que he competido... también busca
// empresas similares... un botón de «no es mi competidor» (con un
// confirmar)".

vi.mock("../../services/competencia.service", () => ({
  getCompetencia: vi.fn(),
  buscarEnLasActas: vi.fn(),
  marcarCompetidor: vi.fn(),
  getEncuentros: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const competidor = (
  rut: string,
  nombre: string,
  extra: Partial<CompetidorReal> = {},
): CompetidorReal => ({
  rut,
  nombre,
  etiquetas: ["compitio"],
  encuentros: 2,
  te_gano: 1,
  ganaste: 1,
  diferencia_de_precio: -10,
  en_tus_compradores: 0,
  triunfos_en_tus_compradores: 0,
  monto_ganado: 0,
  ultima: "2026-03-01",
  similar_razon: null,
  seguido: false,
  descartado: false,
  ...extra,
});

const estado = (
  competidores: CompetidorReal[],
  extra: Partial<EstadoDeLaCompetencia> = {},
): EstadoDeLaCompetencia => ({
  competidores,
  rut_empresa: "77701305-K",
  busqueda: { buscando: false, leidas: 0, total: 0, clasificados: 0 },
  ...extra,
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <CompetidoresReales />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const SOL = competidor("76111222-3", "SOL DE QUILLON SPA");
const ROSAS = competidor("78000111-2", "CENTRO DE EVENTOS LAS ROSAS", {
  etiquetas: ["similar"],
  encuentros: 0,
  diferencia_de_precio: null,
  en_tus_compradores: 5,
  triunfos_en_tus_compradores: 2,
  monto_ganado: 3_000_000,
  similar_razon: "centro de eventos con banquetería",
});

describe("Tus competidores", () => {
  it("con quién compitió (quién ganó y su precio) y quién se le parece en sus compradores", async () => {
    s.getCompetencia.mockResolvedValue(estado([SOL, ROSAS]));
    pintar();
    const sol = (await screen.findByText("SOL DE QUILLON SPA")).closest("li")!;
    expect(within(sol).getByText("Compitió contigo")).toBeInTheDocument();
    expect(
      within(sol).getByText(
        "Se cruzaron 2 veces · ganó él 1 · ganaste tú 1 · Su precio: 10 % más barato que el tuyo",
      ),
    ).toBeInTheDocument();
    const rosas = screen
      .getByText("CENTRO DE EVENTOS LAS ROSAS")
      .closest("li")!;
    expect(within(rosas).getByText("Parecido a ti")).toBeInTheDocument();
    expect(
      within(rosas).getByText(/Según la IA: centro de eventos con banquetería/),
    ).toBeInTheDocument();
    // Las vistas, con su número.
    fireEvent.click(screen.getByRole("button", { name: "Parecidos a ti (1)" }));
    expect(screen.queryByText("SOL DE QUILLON SPA")).not.toBeInTheDocument();
    expect(screen.getByText("CENTRO DE EVENTOS LAS ROSAS")).toBeInTheDocument();
  });

  it("«No es mi competidor» pregunta antes, y sale de la lista; se recupera desde su botón", async () => {
    s.getCompetencia.mockResolvedValue(estado([SOL, ROSAS]));
    s.marcarCompetidor.mockImplementation((rut, cambios) =>
      Promise.resolve({
        rut,
        nombre: null,
        seguido: false,
        descartado: Boolean(cambios.descartado),
      }),
    );
    pintar();
    const sol = (await screen.findByText("SOL DE QUILLON SPA")).closest("li")!;
    fireEvent.click(within(sol).getByText("No es mi competidor"));
    expect(s.marcarCompetidor).not.toHaveBeenCalled();
    fireEvent.click(within(sol).getByRole("button", { name: "Sí, sacar" }));
    await waitFor(() =>
      expect(s.marcarCompetidor).toHaveBeenCalledWith("76111222-3", {
        descartado: true,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("SOL DE QUILLON SPA")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "No son competidores (1)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    await waitFor(() =>
      expect(s.marcarCompetidor).toHaveBeenLastCalledWith("76111222-3", {
        descartado: false,
      }),
    );
  });

  it("«Seguir» lo marca y queda con «Lo sigues»", async () => {
    s.getCompetencia.mockResolvedValue(estado([SOL]));
    s.marcarCompetidor.mockResolvedValue({
      rut: "76111222-3",
      nombre: null,
      seguido: true,
      descartado: false,
    });
    pintar();
    const sol = (await screen.findByText("SOL DE QUILLON SPA")).closest("li")!;
    fireEvent.click(within(sol).getByRole("button", { name: "Seguir" }));
    await waitFor(() =>
      expect(s.marcarCompetidor).toHaveBeenCalledWith("76111222-3", {
        seguido: true,
      }),
    );
    expect(await within(sol).findByText("Lo sigues")).toBeInTheDocument();
    expect(
      within(sol).getByRole("button", { name: "Dejar de seguir" }),
    ).toBeInTheDocument();
  });

  it("sin actas leídas, «Buscar en las actas» empieza y dice cómo va", async () => {
    s.getCompetencia.mockResolvedValue(estado([]));
    s.buscarEnLasActas.mockResolvedValue(
      estado([], {
        busqueda: { buscando: true, leidas: 35, total: 400, clasificados: 0 },
      }),
    );
    pintar();
    expect(
      await screen.findByText(/Todavía no hay actas leídas/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar en las actas" }),
    );
    expect(
      await screen.findByText("Leyendo actas: 35 de 400"),
    ).toBeInTheDocument();
    expect(s.buscarEnLasActas).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Buscar en las actas" }),
    ).not.toBeInTheDocument();
  });

  it("sin el RUT de la empresa, avisa que falta en «Mi empresa»", async () => {
    s.getCompetencia.mockResolvedValue(estado([ROSAS], { rut_empresa: null }));
    pintar();
    expect(
      await screen.findByText(/Falta el RUT de tu empresa en «Mi empresa»/),
    ).toBeInTheDocument();
  });
});
