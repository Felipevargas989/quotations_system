// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as competencia from "../../services/competencia.service";
import CompetidoresOportunidades from "./CompetidoresOportunidades";

// «QUIÉN GANA EN TU ZONA», SOLO LO DEL RUBRO (decisión 71, 23-10). Felipe:
// "siento que estoy como en un mar de productores de eventos y yo no soy
// productor de eventos".

vi.mock("../../services/competencia.service", () => ({
  getQuienGana: vi.fn(),
}));
vi.mock("./CompetidoresReales", () => ({ default: () => null }));
const c = vi.mocked(competencia);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Quién gana en tu zona", () => {
  it("solo lo de tu rubro, con cuánto lleva revisado la IA", async () => {
    c.getQuienGana.mockResolvedValue({
      ranking: [
        {
          rut: "77067895-1",
          nombre: "CENTRO TURISTICO SOL DE QUILLON SPA",
          triunfos: 4,
          monto_total: 31_115_077,
          ultimo: "2025-10-03",
          organismos: [
            { nombre: "ILUSTRE MUNICIPALIDAD DE QUILLON", veces: 3 },
          ],
        },
      ],
      rubro: { revisadas: 1200, total: 5901, revisando: true },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <CompetidoresOportunidades />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Quién gana en tu zona" }));
    expect(
      await screen.findByText("CENTRO TURISTICO SOL DE QUILLON SPA"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La IA lleva 1.200 de 5.901 licitaciones adjudicadas de tu zona · revisando ahora.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sin audio ni escenarios/)).toBeInTheDocument();
  });
});
