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
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import CotizacionDeLaPostulacion from "./CotizacionDeLaPostulacion";
import { veredicto } from "./precioDeLaPostulacion";

// «¿CALZA EL PRECIO?» (decisión 29 del doc 17, 19-10). Felipe: la propuesta
// y la cotización "tienen que ser equivalentes", se vincula "solamente el
// número" y el margen "se ajusta como un descuento en dinero". Los
// servicios van de mentira.

vi.mock("../../services/oportunidades.service", () => ({
  getCotizacionDeLaPostulacion: vi.fn(),
  llevarACotizacion: vi.fn(),
  fijarOfertaDeLaPostulacion: vi.fn(),
}));

const s = vi.mocked(servicio);

const ANTERIOR = {
  codigo: "4364-5-LE25",
  nombre: "Día del Profesor 2025",
  anio: 2025,
  oferentes: 1,
  url_acta: null,
  ganadores: [
    { nombre: "CENTRO TURISTICO SOL DE QUILLON SPA", monto: 12_000_000 },
  ],
};

const CON_COTIZACION: servicio.EstadoDeLaCotizacion = {
  cotizacion: {
    id: "q-612",
    numero: 612,
    estado: "solicitada",
    cliente: "Municipalidad de Quillón",
    catalogo: 6_007_500,
    descuento: 0,
    total: 6_007_500,
  },
  presupuesto: 15_960_000,
  propuesta: { id: 31, productos: 3 },
};

beforeEach(() => {
  s.getCotizacionDeLaPostulacion.mockResolvedValue({
    cotizacion: null,
    presupuesto: 15_960_000,
    propuesta: { id: 31, productos: 3 },
  });
  s.llevarACotizacion.mockResolvedValue(CON_COTIZACION);
  s.fijarOfertaDeLaPostulacion.mockResolvedValue({
    ...CON_COTIZACION,
    cotizacion: {
      ...CON_COTIZACION.cotizacion!,
      descuento: 507_500,
      total: 5_500_000,
    },
  });
});

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
        <CotizacionDeLaPostulacion oportunidadId={87} anterior={ANTERIOR} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("¿Calza el precio?", () => {
  it("sin propuesta técnica con su oferta, dice de dónde salen los productos", async () => {
    s.getCotizacionDeLaPostulacion.mockResolvedValue({
      cotizacion: null,
      presupuesto: null,
      propuesta: null,
    });
    pintar();
    expect(
      await screen.findByText(/Primero crea la propuesta técnica/),
    ).toBeInTheDocument();
    expect(screen.getByText("No lo publicaron")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Crear cotización/ }),
    ).not.toBeInTheDocument();
  });

  it("crea la cotización con los productos de la propuesta, y muestra el catálogo y lo que ganó el año pasado", async () => {
    pintar();
    expect(
      await screen.findByText(/La propuesta técnica ofrece 3 productos/),
    ).toBeInTheDocument();
    expect(screen.getByText("$12.000.000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Crear cotización/ }));
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(87, undefined),
    );
    expect(await screen.findByText("Cotización N° 612")).toBeInTheDocument();
    expect(screen.getAllByText("$6.007.500")).toHaveLength(2);
    expect(
      screen.getByText(/Calza: tu oferta queda 62,4 % bajo el presupuesto/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver la cotización/ }),
    ).toHaveAttribute("href", "/negocio/q-612");
  });

  it("vincular pide el número y pregunta antes de reescribirla", async () => {
    pintar();
    fireEvent.change(await screen.findByLabelText("o vincular la N°"), {
      target: { value: "598" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(s.llevarACotizacion).not.toHaveBeenCalled();
    expect(
      screen.getByText(/La N° 598 se reescribe entera/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Sí, vincular y reescribir" }),
    );
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(87, 598),
    );
  });

  it("la oferta se aplica y queda el descuento en dinero a la vista", async () => {
    s.getCotizacionDeLaPostulacion.mockResolvedValue(CON_COTIZACION);
    pintar();
    fireEvent.change(await screen.findByLabelText("Tu oferta, con IVA"), {
      target: { value: "5500000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar oferta/ }));
    await waitFor(() =>
      expect(s.fijarOfertaDeLaPostulacion).toHaveBeenCalledWith(87, 5_500_000),
    );
    expect(
      await screen.findByText("Descuento $507.500 (8,4 %)"),
    ).toBeInTheDocument();
  });
});

describe("El veredicto", () => {
  it("calza bajo el presupuesto; si se pasa, lo dice; sin presupuesto, nada", () => {
    expect(veredicto(15_960_000, 12_000_000)).toEqual({
      tono: "calza",
      texto: "Calza: tu oferta queda 24,8 % bajo el presupuesto ($3.960.000).",
    });
    expect(veredicto(10_000_000, 11_000_000)?.tono).toBe("se_pasa");
    expect(veredicto(null, 11_000_000)).toBeNull();
  });
});
