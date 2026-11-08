// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecibidosDelMes from "./RecibidosDelMes";

// «RECIBIDOS» (doc 19 §9.28; Felipe, 07-11: «¿ya trajiste las facturas
// recibidas? ¿eso funcionará?»).

const getRecibidos = vi.fn();
const traerRecibidos = vi.fn();
vi.mock("../../services/documentosTributarios.service", () => ({
  getRecibidos: (p: string) => getRecibidos(p),
  traerRecibidos: (p: string) => traerRecibidos(p),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FACTURA = {
  id: 1,
  periodo: "2026-11",
  tipo: 33,
  folio: 1234,
  fecha_emision: "2026-11-03",
  rut_emisor: "76543210-K",
  razon_social_emisor: "Distribuidora Ñuble SpA",
  neto: 100000,
  exento: null,
  iva: 19000,
  total: 119000,
  link_pdf: "https://www.facturacion.cl/pdf?x=1",
  recepcion_sii: "2026-11-03 10:15:00",
  acuse_sii: null,
  tipo_compra: 1,
  traido_en: "2026-11-08T04:00:00Z",
};

const abrir = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RecibidosDelMes />
    </QueryClientProvider>,
  );

describe("Recibidos", () => {
  it("lista lo recibido del mes, con el proveedor, el documento, los montos y el PDF", async () => {
    getRecibidos.mockResolvedValue({
      periodo: "2026-11",
      ambiente: "produccion",
      se_puede_traer: true,
      sin_conexion: null,
      traido_en: FACTURA.traido_en,
      documentos: [
        FACTURA,
        { ...FACTURA, id: 2, tipo: 61, folio: 88, total: 19000 },
      ],
    });
    abrir();
    expect(
      await screen.findAllByText("Distribuidora Ñuble SpA", { selector: "td" }),
    ).toHaveLength(2);
    expect(screen.getByText("Factura 1234")).toBeInTheDocument();
    expect(screen.getByText("Nota de crédito 88")).toBeInTheDocument();
    expect(screen.getByText("−$19.000")).toBeInTheDocument();
    // La NC resta: 119.000 − 19.000.
    expect(
      screen.getByText("$100.000", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /PDF/ })[0]).toHaveAttribute(
      "href",
      "https://www.facturacion.cl/pdf?x=1",
    );
  });

  it("«Traer de facturacion.cl» pide el mes que se ve", async () => {
    getRecibidos.mockResolvedValue({
      periodo: "2026-11",
      ambiente: "produccion",
      se_puede_traer: true,
      sin_conexion: null,
      traido_en: null,
      documentos: [],
    });
    traerRecibidos.mockResolvedValue({
      periodo: "2026-11",
      ambiente: "produccion",
      se_puede_traer: true,
      sin_conexion: null,
      traido_en: FACTURA.traido_en,
      documentos: [FACTURA],
      traidos: 1,
      sin_datos: 0,
    });
    abrir();
    expect(
      await screen.findByText(/Sin documentos recibidos/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Traer de facturacion.cl" }),
    );
    expect(await screen.findByText("Factura 1234")).toBeInTheDocument();
    expect(traerRecibidos).toHaveBeenCalledWith(getRecibidos.mock.calls[0][0]);
  });

  it("sin conexión no se puede traer, y dice por qué", async () => {
    getRecibidos.mockResolvedValue({
      periodo: "2026-11",
      ambiente: "produccion",
      se_puede_traer: false,
      sin_conexion: "facturacion.cl todavía no está conectado",
      traido_en: null,
      documentos: [],
    });
    abrir();
    expect(
      await screen.findByText("facturacion.cl todavía no está conectado."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Traer de facturacion.cl" }),
    ).toBeDisabled();
  });
});
