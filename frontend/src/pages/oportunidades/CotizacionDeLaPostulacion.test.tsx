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
import { cuadre, fechasEnPalabras, veredicto } from "./precioDeLaPostulacion";

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
  vincularCotizacion: vi.fn(),
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

  it("«Crear una nueva» con las fechas de las bases ya puestas: un día dice cuál, y se crea sin escribir nada (decisión 73)", async () => {
    // Felipe, 23-10: "el crear cotización pregunta los días, pero no
    // debería leer las bases para saber si es por día?".
    pintar();
    await abrir();
    expect(screen.getByText("$12.000.000")).toBeInTheDocument();
    expect(await screen.findByText("$5.500.000")).toBeInTheDocument();
    expect(screen.getByText(/Calza: tu oferta queda/)).toBeInTheDocument();
    expect(
      screen.getByText("Para el miércoles 28 de octubre, según las bases."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
    // Sin el ejemplo del catamarán, que salía en todas.
    expect(screen.queryByText(/catamarán/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Crear la cotización" }),
    );
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(
        87,
        undefined,
        5_500_000,
        { desde: "2026-10-28", hasta: null },
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

  it("«Cambiar» abre las fechas: el «hasta» de un día viene igual al «desde», y se puede alargar", async () => {
    pintar();
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-28");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-28");
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-10-29" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Crear la cotización" }),
    );
    await waitFor(() =>
      expect(s.llevarACotizacion).toHaveBeenCalledWith(
        87,
        undefined,
        5_500_000,
        { desde: "2026-10-28", hasta: "2026-10-29" },
      ),
    );
  });

  it("las fechas: sin «desde» o con un «hasta» antes, avisa en línea y no crea", async () => {
    pintar();
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Crear la cotización" }),
    );
    expect(screen.getByText("Elige desde qué día.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-11-06" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Crear la cotización" }),
    );
    expect(
      screen.getByText("El «hasta» tiene que ser después del «desde»."),
    ).toBeInTheDocument();
    expect(s.llevarACotizacion).not.toHaveBeenCalled();
  });

  it("vincular una que ya tienes la une sin reescribirla: confirma ahí mismo y cierra (decisión 73)", async () => {
    // Felipe, 23-10: "ya las vinculé, pero sigue igual abierto"; "no se
    // reescribe".
    p.vincularCotizacion.mockResolvedValue({
      ...CON_COTIZACION,
      cotizacion: { ...CON_COTIZACION.cotizacion!, id: "q-493", numero: 493 },
    });
    pintar();
    await abrir();
    fireEvent.change(screen.getByLabelText("N°"), {
      target: { value: "493" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(p.vincularCotizacion).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "La N° 493 se une a esta licitación sin cambiar sus productos ni precios, y pasa al miércoles 28 de octubre, la fecha de las bases.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, vincular" }));
    await waitFor(() =>
      expect(p.vincularCotizacion).toHaveBeenCalledWith(87, 493),
    );
    expect(s.llevarACotizacion).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Cotización N° 493 · solicitada/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("N°")).not.toBeInTheDocument();
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

  it("las fechas de las bases en palabras: un día, varios días o ninguna (decisión 73)", () => {
    expect(fechasEnPalabras({ desde: "2026-11-26", hasta: null })).toEqual({
      unDia: true,
      texto: "jueves 26 de noviembre",
    });
    expect(
      fechasEnPalabras({ desde: "2026-11-26", hasta: "2026-11-26" })?.unDia,
    ).toBe(true);
    expect(
      fechasEnPalabras({ desde: "2026-11-06", hasta: "2026-11-08" }),
    ).toEqual({
      unDia: false,
      texto: "del viernes 6 de noviembre al domingo 8 de noviembre",
    });
    expect(fechasEnPalabras(null)).toBeNull();
  });

  it("la cotización frente a la oferta: cuadra, le falta o le sobra; sin cotización, nada", () => {
    expect(cuadre(5_500_000, 5_500_000)?.tono).toBe("calza");
    expect(cuadre(7_090_000, 4_000_000)?.tono).toBe("falta");
    expect(cuadre(5_500_000, 6_007_500)?.tono).toBe("sobra");
    expect(cuadre(5_500_000, null)).toBeNull();
    expect(cuadre(0, 4_000_000)).toBeNull();
  });
});
