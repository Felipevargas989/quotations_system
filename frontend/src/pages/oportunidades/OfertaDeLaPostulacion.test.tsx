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
import OfertaDeLaPostulacion from "./OfertaDeLaPostulacion";

// LA OFERTA (decisión 33, sprint G, 19-10): la matriz «lo que piden → lo
// que ofreces» y lo que falta en el catálogo.

vi.mock("../../services/oportunidades.service", () => ({
  getOfertaDeLaPostulacion: vi.fn(),
  armarLaOferta: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OfertaDeLaPostulacion oportunidadId={40} />
    </QueryClientProvider>,
  );

describe("La oferta de la postulación", () => {
  it("sin oferta, se pide con un botón", async () => {
    s.getOfertaDeLaPostulacion.mockResolvedValue(null);
    s.armarLaOferta.mockResolvedValue({
      id: 21,
      estado: "procesando",
    } as never);
    pintar();
    const boton = await screen.findByRole("button", {
      name: "Armar la oferta con IA",
    });
    fireEvent.click(boton);
    await waitFor(() => expect(s.armarLaOferta).toHaveBeenCalledWith(40));
    expect(
      await screen.findByRole("button", { name: "Armando la oferta…" }),
    ).toBeDisabled();
  });

  it("lista lo que piden, lo que se ofrece y de dónde sale, y lo que falta en el catálogo", async () => {
    s.getOfertaDeLaPostulacion.mockResolvedValue({
      id: 21,
      estado: "listo",
      resultado: {
        resumen: "La cena sale del catálogo; el escenario hay que agregarlo.",
        matriz: [
          {
            especificacion: "160 brochetas de carne (vacuno y pollo)",
            pagina: 19,
            como: "160 brochetas de carne de vacuno y pollo.",
            origen: "catalogo",
            productos: [31],
          },
          {
            especificacion: "Escenario 4x3 m",
            pagina: 18,
            como: "Escenario de 4x3 m con escalera y faldón negro.",
            origen: "subcontratar",
            productos: [],
          },
        ],
        faltan_en_el_catalogo: [
          {
            que: "Escenario 4x3 m con escalera y faldón negro",
            por_que: "pág. 18",
          },
        ],
      },
    } as never);
    pintar();
    expect(
      await screen.findByText("160 brochetas de carne de vacuno y pollo."),
    ).toBeInTheDocument();
    expect(screen.getByText("Catálogo")).toBeInTheDocument();
    expect(screen.getByText("Agregar al catálogo")).toBeInTheDocument();
    expect(screen.getByText("Falta en tu catálogo (1)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Volver a armar" }),
    ).toBeEnabled();
  });
});
