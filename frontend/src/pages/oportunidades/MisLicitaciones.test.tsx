// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import MisLicitaciones from "./MisLicitaciones";

// "MIS LICITACIONES" (Felipe, 17-10: "¿dónde van a quedar compiladas las
// que sí me interesan para luego trabajarlas?").

const avance = (parcial = {}) => ({
  bases: 0,
  analisis: null,
  anexos: null,
  propuesta: null,
  postulacion: 0,
  generados: 0,
  firmados: 0,
  validacion: null,
  ...parcial,
});

const mia = (
  id: number,
  nombre: string,
  estado: string,
  parcial: Record<string, unknown> = {},
) => ({
  id,
  codigo: `C-${id}`,
  semaforo: "amarillo",
  etiquetas: [],
  se_hace_en_el_complejo: "dudoso",
  razon: null,
  alertas: [],
  estado,
  responsable_id: "p-2",
  leida_en: null,
  anterior: null,
  proceso: {
    tipo: "licitacion",
    nombre,
    organismo: "I MUNICIPALIDAD DE QUILLON",
    organismo_codigo: "1",
    unidad: null,
    comuna: "Quillón",
    region: "Región del Ñuble",
    monto: 12_000_000,
    fecha_publicacion: "2026-10-09T16:24:00.000Z",
    fecha_cierre: "2026-10-19T18:01:00.000Z",
    estado: "Publicada",
  },
  avance: avance(),
  ...parcial,
});

vi.mock("../../services/oportunidades.service", () => ({
  getMisLicitaciones: vi.fn(),
  actualizarOportunidad: vi.fn(),
}));
vi.mock("../../services/users.service", () => ({
  getUsers: vi.fn(() =>
    Promise.resolve({
      data: [{ id: "p-2", full_name: "Camila", role: "administrador" }],
      error: null,
    }),
  ),
}));

const s = vi.mocked(servicio);

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
      <MemoryRouter initialEntries={["/oportunidades"]}>
        <Routes>
          <Route path="/oportunidades" element={<MisLicitaciones />} />
          <Route path="/oportunidades/:id" element={<p>Ficha abierta</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Mis licitaciones", () => {
  it("cada una con su avance, el estado y quién la lleva; las ganadas y perdidas, plegadas", async () => {
    s.getMisLicitaciones.mockResolvedValue([
      mia(40, "Ceremonia y Cena Día del Funcionario", "en_estudio", {
        avance: avance({
          bases: 3,
          analisis: "listo",
          generados: 1,
          validacion: { estado: "listo", listo: "casi" },
        }),
      }),
      mia(87, "Producción de evento Día del Profesor", "en_estudio"),
      mia(5, "Cena de fin de año 2025", "ganada"),
    ] as never);
    pintar();

    expect(
      await screen.findByText("Ceremonia y Cena Día del Funcionario"),
    ).toBeInTheDocument();
    expect(screen.getByText("Faltan las bases")).toBeInTheDocument();
    expect(await screen.findAllByText("Camila")).toHaveLength(2);
    expect(screen.queryByText("Cena de fin de año 2025")).toBeNull();
    fireEvent.click(screen.getByText("Ganadas y perdidas (1)"));
    expect(screen.getByText("Cena de fin de año 2025")).toBeInTheDocument();
  });

  it("pinchar la tarjeta abre la ficha, donde se trabaja", async () => {
    s.getMisLicitaciones.mockResolvedValue([
      mia(40, "Ceremonia y Cena Día del Funcionario", "en_estudio"),
    ] as never);
    pintar();
    fireEvent.click(await screen.findByText("Faltan las bases"));
    expect(await screen.findByText("Ficha abierta")).toBeInTheDocument();
  });

  it("sin ninguna marcada, dice cómo llegan", async () => {
    s.getMisLicitaciones.mockResolvedValue([]);
    pintar();
    expect(
      await screen.findByText(/En la Bandeja, pincha una licitación/),
    ).toBeInTheDocument();
  });
});
