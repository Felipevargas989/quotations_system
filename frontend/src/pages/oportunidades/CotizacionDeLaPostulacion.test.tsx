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
import * as postulacion from "../../services/postulacion.service";
import CotizacionDeLaPostulacion from "./CotizacionDeLaPostulacion";
import { veredicto } from "./precioDeLaPostulacion";

// «¿CALZA EL PRECIO?» (decisión 29 del doc 17, 19-10). Felipe: la propuesta
// y la cotización "tienen que ser equivalentes", se vincula "solamente el
// número" y el margen "se ajusta como un descuento en dinero". Los
// servicios van de mentira.

vi.mock("../../services/oportunidades.service", () => ({
  getCotizacionDeLaPostulacion: vi.fn(),
  llevarACotizacion: vi.fn(),
}));
vi.mock("../../services/postulacion.service", () => ({
  getOfertaDeLaPostulacion: vi.fn(),
}));

const s = vi.mocked(servicio);
const p = vi.mocked(postulacion);

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
  s.llevarACotizacion.mockResolvedValue({
    ...CON_COTIZACION,
    cotizacion: {
      ...CON_COTIZACION.cotizacion!,
      descuento: 507_500,
      total: 5_500_000,
    },
  });
  // «Armar postulación» con su precio (decisión 35).
  p.getOfertaDeLaPostulacion.mockResolvedValue({
    id: 21,
    estado: "listo",
    parametros: { postulacion: { total: 5_500_000, propuesta: true } },
  } as never);
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
  it("sin lo postulado, dice de dónde sale la cotización", async () => {
    s.getCotizacionDeLaPostulacion.mockResolvedValue({
      cotizacion: null,
      presupuesto: null,
      propuesta: null,
    });
    pintar();
    expect(
      await screen.findByText(/Primero arma la postulación/),
    ).toBeInTheDocument();
    expect(screen.getByText("No lo publicaron")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Vincular con cotización/ }),
    ).not.toBeInTheDocument();
  });

  it("con el precio de la postulación dice si calza; «Vincular con cotización» crea una nueva con ese precio", async () => {
    pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: /Vincular con cotización/ }),
    );
    expect(screen.getByText("$12.000.000")).toBeInTheDocument();
    expect(await screen.findByText("$5.500.000")).toBeInTheDocument();
    expect(screen.getByText(/Calza: tu oferta queda/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear una nueva" }));
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(
        87,
        undefined,
        5_500_000,
      ),
    );
    expect(
      await screen.findByText(/Cotización N° 612 · solicitada/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/De solo lectura: es lo postulado/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver la cotización/ }),
    ).toHaveAttribute("href", "/negocio/q-612");
  });

  it("vincular una existente pide el número y avisa que se reescribe y queda de solo lectura", async () => {
    pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: /Vincular con cotización/ }),
    );
    fireEvent.change(screen.getByLabelText("Vincular la N°"), {
      target: { value: "598" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(s.llevarACotizacion).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /La N° 598 se reescribe entera con lo postulado y queda de solo lectura/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, vincular" }));
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(87, 598, 5_500_000),
    );
  });

  it("vinculada: sin botones para cambiarla, porque es lo postulado", async () => {
    s.getCotizacionDeLaPostulacion.mockResolvedValue(CON_COTIZACION);
    pintar();
    expect(
      await screen.findByText(/Cotización N° 612 · solicitada/),
    ).toBeInTheDocument();
    expect(screen.getByText(/De solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
