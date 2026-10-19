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
import * as oportunidades from "../../services/oportunidades.service";
import * as servicio from "../../services/postulacion.service";
import OfertaDeLaPostulacion from "./OfertaDeLaPostulacion";

// LO QUE TIENES QUE CONSEGUIR (19-10; antes «Qué ofreces», decisión 33):
// arriba lo que falta en el catálogo y lo que queda por definir; la oferta
// punto por punto, plegada. Felipe: "un mini resumen de qué cosas están
// comprometidas que no tenemos certeza de si las tenemos".

vi.mock("../../services/postulacion.service", () => ({
  getOfertaDeLaPostulacion: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  getAnalisis: vi.fn(),
}));
const s = vi.mocked(servicio);
const o = vi.mocked(oportunidades);

/** El último análisis de las bases, de las 17:00 del 19-10. */
const ANALISIS = { estado: "listo", creado_en: "2026-10-19T20:00:37.000Z" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (analisis: unknown = ANALISIS) => {
  o.getAnalisis.mockResolvedValue(analisis as never);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OfertaDeLaPostulacion oportunidadId={40} />
    </QueryClientProvider>,
  );
};

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

  it("arriba lo que hay que conseguir y lo por definir (sin los formularios); la oferta, plegada", async () => {
    s.getOfertaDeLaPostulacion.mockResolvedValue({
      id: 21,
      estado: "listo",
      creado_en: "2026-10-19T20:30:00.000Z",
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
          {
            especificacion: "Show de baile con caracterización",
            pagina: 18,
            como: "[COMPLETAR: la temática del show de baile]",
            origen: "completar",
            productos: [],
          },
          {
            especificacion: "Formulario Anexo N°3 Experiencia del Oferente",
            pagina: 7,
            como: "[COMPLETAR: listado de servicios similares]",
            origen: "completar",
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
      await screen.findByText("Lo que tienes que conseguir"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Conseguir o subcontratar (1)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Escenario 4x3 m con escalera y faldón negro"),
    ).toBeInTheDocument();
    expect(screen.getByText("Por definir (1)")).toBeInTheDocument();
    expect(
      screen.getByText("la temática del show de baile"),
    ).toBeInTheDocument();
    // El formulario se completa al hacer los anexos: no va aquí.
    expect(screen.queryByText("listado de servicios similares")).toBeNull();
    // La oferta punto por punto, plegada.
    expect(
      screen.queryByText("160 brochetas de carne de vacuno y pollo."),
    ).toBeNull();
    fireEvent.click(screen.getByText(/Ver la oferta punto por punto/));
    expect(
      screen.getByText("160 brochetas de carne de vacuno y pollo."),
    ).toBeInTheDocument();
    expect(screen.getByText("Catálogo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Armar/ })).toBeNull();
    // Hecha después del último análisis: sin aviso.
    expect(screen.queryByText(/antes del último análisis/)).toBeNull();
  });

  it("si todo sale del catálogo lo dice; si la oferta es anterior al análisis, avisa (el Profesor, 19-10)", async () => {
    s.getOfertaDeLaPostulacion.mockResolvedValue({
      id: 5,
      estado: "listo",
      creado_en: "2026-10-19T18:12:59.000Z",
      resultado: {
        resumen: "",
        matriz: [
          {
            especificacion: "Almuerzo de plateada",
            pagina: 1,
            como: "Plateada al horno con papas rústicas.",
            origen: "catalogo",
            productos: [3],
          },
        ],
        faltan_en_el_catalogo: [],
      },
    } as never);
    pintar();
    expect(
      await screen.findByText("Todo lo que ofreces sale de tu catálogo."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Esta oferta es de antes del último análisis/),
    ).toBeInTheDocument();
  });
});
