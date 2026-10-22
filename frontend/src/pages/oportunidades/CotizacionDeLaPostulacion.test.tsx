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
import { cuadre, veredicto } from "./precioDeLaPostulacion";

// «¿CALZA EL PRECIO?» (decisión 29 del doc 17, 19-10). Felipe: la propuesta
// y la cotización "tienen que ser equivalentes", se vincula "solamente el
// número" y el margen "se ajusta como un descuento en dinero". Desde la
// decisión 69 (22-10, el catamarán): la cotización se crea siempre, en las
// fechas elegidas; lo que no cuadra va en rojo, con la lista de lo que
// falta, y se reescribe con lo postulado solo con el botón. Los servicios
// van de mentira.

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
  faltan: [],
  fechas: { desde: "2026-10-28", hasta: null },
};

beforeEach(() => {
  s.getCotizacionDeLaPostulacion.mockResolvedValue({
    cotizacion: null,
    presupuesto: 15_960_000,
    propuesta: { id: 31, productos: 3 },
    faltan: [],
    fechas: { desde: "2026-10-28", hasta: null },
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

const abrir = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: /Crear o vincular cotización/ }),
  );

describe("¿Calza el precio?", () => {
  it("sin lo postulado, dice de dónde sale la cotización", async () => {
    s.getCotizacionDeLaPostulacion.mockResolvedValue({
      cotizacion: null,
      presupuesto: null,
      propuesta: null,
      faltan: [],
      fechas: null,
    });
    pintar();
    expect(
      await screen.findByText(/Primero arma la postulación/),
    ).toBeInTheDocument();
    expect(screen.getByText("No lo publicaron")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Crear o vincular cotización/ }),
    ).not.toBeInTheDocument();
  });

  it("«Crear una nueva» la crea con tu oferta y las fechas elegidas (las de las bases, propuestas)", async () => {
    pintar();
    await abrir();
    expect(screen.getByText("$12.000.000")).toBeInTheDocument();
    expect(await screen.findByText("$5.500.000")).toBeInTheDocument();
    expect(screen.getByText(/Calza: tu oferta queda/)).toBeInTheDocument();
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-28");
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-10-29" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear una nueva" }));
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(
        87,
        undefined,
        5_500_000,
        { desde: "2026-10-28", hasta: "2026-10-29" },
      ),
    );
    expect(
      await screen.findByText(/Cotización N° 612 · solicitada/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Puedes editarla/)).toBeInTheDocument();
    expect(
      screen.getByText("Tu cotización cuadra con tu oferta."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver la cotización/ }),
    ).toHaveAttribute("href", "/negocio/q-612");
  });

  it("las fechas: sin «desde» o con un «hasta» antes, avisa en línea y no crea", async () => {
    pintar();
    await abrir();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear una nueva" }));
    expect(screen.getByText("Elige desde qué día.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-11-06" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear una nueva" }));
    expect(
      screen.getByText("El «hasta» tiene que ser después del «desde»."),
    ).toBeInTheDocument();
    expect(s.llevarACotizacion).not.toHaveBeenCalled();
  });

  it("vincular una existente pide el número y avisa que se reescribe", async () => {
    pintar();
    await abrir();
    fireEvent.change(screen.getByLabelText("Vincular la N°"), {
      target: { value: "598" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(s.llevarACotizacion).not.toHaveBeenCalled();
    expect(
      screen.getByText(/La N° 598 se reescribe entera con lo postulado/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, vincular" }));
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(
        87,
        598,
        5_500_000,
        undefined,
      ),
    );
  });

  it("vinculada y con más que tu oferta: en rojo; se reescribe con lo postulado solo con el botón y su confirmación", async () => {
    s.getCotizacionDeLaPostulacion.mockResolvedValue(CON_COTIZACION);
    pintar();
    expect(
      await screen.findByText(/Cotización N° 612 · solicitada/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tu cotización suma \$507\.500 más que tu oferta/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Reescribir con lo postulado" }),
    );
    expect(s.llevarACotizacion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, reescribir" }));
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(
        87,
        undefined,
        5_500_000,
        undefined,
      ),
    );
  });

  it("le falta para tu oferta (lo subcontratado): en rojo y con la lista de lo que falta", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue({
      id: 21,
      estado: "listo",
      parametros: { postulacion: { total: 7_090_000, propuesta: true } },
    } as never);
    s.getCotizacionDeLaPostulacion.mockResolvedValue({
      ...CON_COTIZACION,
      cotizacion: {
        ...CON_COTIZACION.cotizacion!,
        catalogo: 4_000_000,
        total: 4_000_000,
      },
      faltan: [
        "Catamarán para 30 personas con capitán, del 2 al 8 de noviembre",
      ],
    });
    pintar();
    expect(
      await screen.findByText(/A tu cotización le faltan \$3\.090\.000/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Lo que falta en la cotización (1)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Catamarán para 30 personas con capitán, del 2 al 8 de noviembre",
      ),
    ).toBeInTheDocument();
  });
});

describe("El veredicto y el cuadre", () => {
  it("calza bajo el presupuesto; si se pasa, lo dice; sin presupuesto, nada", () => {
    expect(veredicto(15_960_000, 12_000_000)).toEqual({
      tono: "calza",
      texto: "Calza: tu oferta queda 24,8 % bajo el presupuesto ($3.960.000).",
    });
    expect(veredicto(10_000_000, 11_000_000)?.tono).toBe("se_pasa");
    expect(veredicto(null, 11_000_000)).toBeNull();
  });

  it("la cotización frente a la oferta: cuadra, le falta o le sobra; sin cotización, nada", () => {
    expect(cuadre(5_500_000, 5_500_000)?.tono).toBe("calza");
    expect(cuadre(7_090_000, 4_000_000)?.tono).toBe("falta");
    expect(cuadre(5_500_000, 6_007_500)?.tono).toBe("sobra");
    expect(cuadre(5_500_000, null)).toBeNull();
    expect(cuadre(0, 4_000_000)).toBeNull();
  });
});
