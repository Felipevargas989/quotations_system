// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as competencia from "../../services/competencia.service";
import type { FichaDeMercado } from "../../services/competencia.service";
import CompetidorPage from "./CompetidorPage";

// LA FICHA DE UN COMPETIDOR COMO ESTUDIO DE MERCADO (decisión 71, 23-10).
// Felipe: "me gustaría ver en cuáles más él participó y perdió, él
// participó y ganó... qué tipo de cosas hacen y a quién les venden".

vi.mock("../../services/competencia.service", () => ({
  getFichaDeMercado: vi.fn(),
}));
const c = vi.mocked(competencia);

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

const FICHA: FichaDeMercado = {
  rut: "77067895-1",
  nombre: "CENTRO TURISTICO SOL DE QUILLON SPA",
  seguido: true,
  descartado: false,
  resumen: {
    participaciones: 2,
    ganadas: 1,
    perdidas: 1,
    monto_ganado: 12_000_000,
    ultima: "2025-10-03",
    compradores: [
      { nombre: "ILUSTRE MUNICIPALIDAD DE QUILLON", veces: 2, ganadas: 1 },
    ],
  },
  encuentros: [
    {
      codigo: "4364-5-LE25",
      proceso: "Día del Profesor 2025",
      organismo: "ILUSTRE MUNICIPALIDAD DE QUILLON",
      fecha: "2025-09-20",
      su_oferta: 12_000_000,
      tu_oferta: 10_000_000,
      gano_el: true,
      ganaste: false,
      diferencia_de_precio: 20,
      lineas_comparadas: 1,
    },
  ],
  licitaciones: [
    {
      codigo: "4364-5-LE25",
      proceso: "Día del Profesor 2025",
      organismo: "ILUSTRE MUNICIPALIDAD DE QUILLON",
      comuna: "Quillón",
      fecha: "2025-10-03",
      su_oferta: 12_000_000,
      lineas: 1,
      detalle: "Almuerzo y salón",
      gano: true,
      ganadores: [
        {
          rut: "77067895-1",
          nombre: "CENTRO TURISTICO SOL DE QUILLON SPA",
          monto: 12_000_000,
        },
      ],
      ofertas: 2,
      contigo: true,
    },
    {
      codigo: "4364-9-LE24",
      proceso: "Fiesta de fin de año 2024",
      organismo: "ILUSTRE MUNICIPALIDAD DE QUILLON",
      comuna: "Quillón",
      fecha: "2024-12-01",
      su_oferta: 8_000_000,
      lineas: 1,
      detalle: null,
      gano: false,
      ganadores: [{ rut: "78000111-2", nombre: "LAS ROSAS", monto: 7_500_000 }],
      ofertas: 3,
      contigo: false,
    },
  ],
};

describe("La ficha de un competidor", () => {
  it("cuánto participa y gana, a quién le vende, cuándo compitió contigo y todas sus licitaciones (con quién le ganó)", async () => {
    c.getFichaDeMercado.mockResolvedValue(FICHA);
    pintar("77067895-1");
    expect(
      await screen.findByRole("heading", {
        name: "CENTRO TURISTICO SOL DE QUILLON SPA",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lo sigues")).toBeInTheDocument();
    expect(
      screen.getByText(
        "ILUSTRE MUNICIPALIDAD DE QUILLON · participó 2, ganó 1",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ganó él · Su precio: 20 % más caro que el tuyo"),
    ).toBeInTheDocument();
    const perdida = screen
      .getByText("Fiesta de fin de año 2024")
      .closest("li")!;
    expect(within(perdida).getByText(/Ganó LAS ROSAS/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ganó (1)" }));
    expect(
      screen.queryByText("Fiesta de fin de año 2024"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Día del Profesor 2025").length).toBeGreaterThan(
      0,
    );
  });

  it("sin nada en las actas ni en lo adjudicado, lo dice", async () => {
    c.getFichaDeMercado.mockRejectedValue(new Error("404"));
    pintar("76111222-3");
    expect(
      await screen.findByText(
        "No encontramos a ese proveedor en las actas ni en lo adjudicado en tu zona.",
      ),
    ).toBeInTheDocument();
  });
});
