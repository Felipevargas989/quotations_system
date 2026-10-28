// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import { hoyEnChile, hoyEnChileMas } from "../../utils/dates";
import Ganadas from "./Ganadas";

// «GANADAS» (decisión 100, 28-10). Felipe: "las ganadas deberían estar en
// alguna parte más visible, para que no se me...".

const mia = (
  id: number,
  nombre: string,
  estado: string,
  servicioDeLaGanada: { texto: string; dias: string[] } | null = null,
) => ({
  id,
  codigo: `C-${id}`,
  semaforo: "amarillo",
  etiquetas: [],
  se_hace_en_el_complejo: "si",
  razon: null,
  alertas: [],
  estado,
  responsable_id: null,
  leida_en: null,
  anterior: null,
  proceso: {
    tipo: "compra_agil",
    nombre,
    organismo: "ILUSTRE MUNICIPALIDAD DE QUILLON",
    organismo_codigo: "1",
    unidad: null,
    comuna: "Quillón",
    region: "Región del Ñuble",
    monto: 1_250_000,
    fecha_publicacion: "2026-10-20T16:24:00.000Z",
    fecha_cierre: "2026-10-27T19:15:00.000Z",
    estado: "Adjudicada",
  },
  avance: {
    bases: 0,
    analisis: null,
    anexos: null,
    propuesta: null,
    postulacion: 0,
    generados: 0,
    firmados: 0,
    validacion: null,
  },
  servicio: servicioDeLaGanada,
});

vi.mock("../../services/oportunidades.service", () => ({
  getMisLicitaciones: vi.fn(),
  actualizarOportunidad: vi.fn(),
}));
vi.mock("../../services/users.service", () => ({
  getUsers: vi.fn(() => Promise.resolve({ data: [], error: null })),
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
      <MemoryRouter>
        <Ganadas />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Ganadas", () => {
  it("por cumplir arriba, en dorado y con el servicio (hoy, en rojo); las cumplidas abajo; ni perdidas ni en estudio", async () => {
    s.getMisLicitaciones.mockResolvedValue([
      mia(5171, "Alimentación Autoridades Laja Diguillín", "ganada", {
        texto: "28 de octubre 2026, hora por confirmar",
        dias: [hoyEnChile()],
      }),
      mia(7, "Cena de fin de año", "ganada", {
        texto: "Viernes 18 de diciembre de 2025",
        dias: [hoyEnChileMas(-3)],
      }),
      mia(3219, "Arriendo de catamarán", "perdida"),
      mia(4633, "Día de Campo del Dirigente Social", "en_estudio"),
    ] as never);
    pintar();

    expect(await screen.findByText("Por cumplir (1)")).toBeInTheDocument();
    expect(screen.getByText("Cumplidas (1)")).toBeInTheDocument();
    expect(
      screen.getByText("Alimentación Autoridades Laja Diguillín").closest("li"),
    ).toHaveClass("bg-amber-50");
    expect(screen.getByText(/^hoy, /)).toHaveClass("text-red-600");
    expect(
      screen.getByText("28 de octubre 2026, hora por confirmar"),
    ).toBeInTheDocument();
    expect(screen.getByText("Cena de fin de año").closest("li")).toHaveClass(
      "bg-white",
    );
    // A la derecha, el servicio en vez del cierre.
    expect(screen.queryByText(/^Cierra /)).toBeNull();
    expect(screen.queryByText("Arriendo de catamarán")).toBeNull();
    expect(screen.queryByText("Día de Campo del Dirigente Social")).toBeNull();
  });

  it("si las bases no dicen cuándo, queda por cumplir y lo dice", async () => {
    s.getMisLicitaciones.mockResolvedValue([
      mia(9, "Servicios a pedido", "ganada", null),
    ] as never);
    pintar();
    expect(await screen.findByText("Por cumplir (1)")).toBeInTheDocument();
    expect(screen.getByText("Sin fecha en las bases")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Todavía ninguna. Aquí quedan desde el día siguiente del servicio.",
      ),
    ).toBeInTheDocument();
  });

  it("sin ninguna ganada, dice cómo llegan", async () => {
    s.getMisLicitaciones.mockResolvedValue([
      mia(3219, "Arriendo de catamarán", "perdida"),
    ] as never);
    pintar();
    expect(
      await screen.findByText(/Todavía no ganas ninguna/),
    ).toBeInTheDocument();
  });
});
