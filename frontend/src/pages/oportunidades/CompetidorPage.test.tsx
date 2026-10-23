// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as competencia from "../../services/competencia.service";
import * as oportunidades from "../../services/oportunidades.service";
import CompetidorPage from "./CompetidorPage";

// LA FICHA DE UN COMPETIDOR con «Cuando compitió contigo» (decisión 70,
// 22-10): las licitaciones donde ofertaron los dos, aunque nunca haya
// ganado en la zona (el motor dice 404 a la ficha de la zona).

vi.mock("../../services/competencia.service", () => ({
  getEncuentros: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  getCompetidor: vi.fn(),
}));
const c = vi.mocked(competencia);
const o = vi.mocked(oportunidades);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (rut: string) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[`/oportunidades/competidores/${rut}`]}>
        <Routes>
          <Route
            path="/oportunidades/competidores/:rut"
            element={<CompetidorPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("La ficha de un competidor", () => {
  it("sin triunfos en la zona, igual muestra cuándo compitió contigo: su oferta, la tuya y quién ganó", async () => {
    o.getCompetidor.mockRejectedValue(new Error("404"));
    c.getEncuentros.mockResolvedValue({
      nombre: "SOL DE QUILLON SPA",
      encuentros: [
        {
          codigo: "4364-5-LE25",
          proceso: "Día del Profesor 2025",
          organismo: "I. Municipalidad de Quillón",
          fecha: "2025-09-20",
          su_oferta: 9_000_000,
          tu_oferta: 10_000_000,
          gano_el: false,
          ganaste: true,
        },
      ],
    });
    pintar("76111222-3");
    expect(
      await screen.findByRole("heading", { name: "SOL DE QUILLON SPA" }),
    ).toBeInTheDocument();
    const fila = screen.getByText("Día del Profesor 2025").closest("li")!;
    expect(
      within(fila).getByText(
        "Ganaste tú · Su precio: 10 % más barato que el tuyo",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lo que ganó")).not.toBeInTheDocument();
  });

  it("sin triunfos ni encuentros, lo dice", async () => {
    o.getCompetidor.mockRejectedValue(new Error("404"));
    c.getEncuentros.mockResolvedValue({ nombre: null, encuentros: [] });
    pintar("76111222-3");
    expect(
      await screen.findByText(
        "No encontramos a ese proveedor en tus regiones ni en tus licitaciones.",
      ),
    ).toBeInTheDocument();
  });
});
