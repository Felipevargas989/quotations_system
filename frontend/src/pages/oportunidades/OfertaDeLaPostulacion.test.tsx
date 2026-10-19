// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/postulacion.service";
import OfertaDeLaPostulacion from "./OfertaDeLaPostulacion";

// QUÉ OFRECES (decisión 33, sprint G, 19-10): la matriz «lo que piden → lo
// que ofreces» y lo que falta en el catálogo. Desde la decisión 35 solo se
// muestra: se arma con «Armar postulación».

vi.mock("../../services/postulacion.service", () => ({
  getOfertaDeLaPostulacion: vi.fn(),
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
  it("sin oferta lista no muestra nada (se arma arriba, con «Armar postulación»)", async () => {
    s.getOfertaDeLaPostulacion.mockResolvedValue({
      id: 21,
      estado: "procesando",
    } as never);
    const { container } = pintar();
    await waitFor(() =>
      expect(s.getOfertaDeLaPostulacion).toHaveBeenCalledWith(40),
    );
    expect(container).toBeEmptyDOMElement();
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
    expect(screen.getByText("Qué ofreces")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
