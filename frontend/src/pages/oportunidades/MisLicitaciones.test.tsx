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

describe("Mis licitaciones, siempre al día (23-10)", () => {
  it("al volver a la lista la pide de nuevo, aunque la acabe de traer: lo que se lanzó en una ficha se ve girando", async () => {
    // Felipe: "dentro de la ficha análisis sí estaba pensando, pero cuando
    // salgo, análisis no estaba pensando".
    s.getMisLicitaciones
      .mockResolvedValueOnce([mia(91, "Día de Campo", "en_estudio")] as never)
      .mockResolvedValue([
        mia(91, "Día de Campo", "en_estudio", {
          avance: avance({ bases: 1, analisis: "procesando" }),
        }),
      ] as never);
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const lista = () => (
      <QueryClientProvider client={cliente}>
        <MemoryRouter initialEntries={["/oportunidades"]}>
          <Routes>
            <Route path="/oportunidades" element={<MisLicitaciones />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const primera = render(lista());
    expect(await screen.findByText("Faltan las bases")).toBeInTheDocument();
    primera.unmount();
    render(lista());
    expect(await screen.findByText("Análisis")).toBeInTheDocument();
    await screen.findByText((_, el) =>
      Boolean(
        el?.textContent === "Análisis" && el.querySelector(".animate-spin"),
      ),
    );
    expect(s.getMisLicitaciones).toHaveBeenCalledTimes(2);
  });
});

describe("Mis licitaciones", () => {
  it("por postular arriba, por vencimiento; las postuladas abajo, aparte y en verde (19-10)", async () => {
    s.getMisLicitaciones.mockResolvedValue([
      mia(84, "Día del Profesor", "postulada"),
      mia(91, "Día de Campo del Dirigente", "en_estudio", {
        proceso: {
          ...mia(0, "", "").proceso,
          nombre: "Día de Campo del Dirigente",
          fecha_cierre: "2099-11-20T18:00:00.000Z",
        },
      }),
      mia(92, "Cena aniversario", "en_estudio", {
        proceso: {
          ...mia(0, "", "").proceso,
          nombre: "Cena aniversario",
          fecha_cierre: "2099-11-05T18:00:00.000Z",
        },
      }),
    ] as never);
    pintar();

    expect(await screen.findByText("Por postular (2)")).toBeInTheDocument();
    expect(screen.getByText("Postuladas (1)")).toBeInTheDocument();
    const nombres = screen.getAllByRole("link").map((a) => a.textContent);
    // La que vence antes, primero; la postulada, al final.
    expect(nombres).toEqual([
      "Cena aniversario",
      "Día de Campo del Dirigente",
      "Día del Profesor",
    ]);
    expect(screen.getByText("Día del Profesor").closest("li")).toHaveClass(
      "bg-green-50",
    );
    expect(screen.getByText("Cena aniversario").closest("li")).toHaveClass(
      "bg-white",
    );
  });

  it("cada una con su avance, el estado y quién la lleva; las perdidas, plegadas al final, y las ganadas en su pestaña (decisión 100)", async () => {
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
      mia(3219, "Arriendo de catamarán", "perdida", {
        // Decisión 92: el resultado sigue en la tarjeta.
        resultado: {
          tipo: "compra_agil",
          estado: "perdida",
          proveedor: "BPM EVENTOS SPA",
          rut_proveedor: "76.430.926-k",
          monto: 6_800_000,
          mi_monto: 7_090_000,
          lugar: 2,
          ofertas: 2,
          era_la_mas_barata: false,
          inadmisible: null,
        },
      }),
    ] as never);
    pintar();

    expect(
      await screen.findByText("Ceremonia y Cena Día del Funcionario"),
    ).toBeInTheDocument();
    expect(screen.getByText("Faltan las bases")).toBeInTheDocument();
    expect(await screen.findAllByText("Camila")).toHaveLength(2);
    expect(screen.queryByText("Arriendo de catamarán")).toBeNull();
    fireEvent.click(screen.getByText("Perdidas (1)"));
    expect(screen.getByText("Arriendo de catamarán")).toBeInTheDocument();
    expect(
      screen.getByText(/^Eligieron a BPM EVENTOS SPA por \$6\.800\.000\./),
    ).toBeInTheDocument();
    // Felipe: "no me gusta que las perdidas queden con las ganadas".
    expect(screen.queryByText("Cena de fin de año 2025")).toBeNull();
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
