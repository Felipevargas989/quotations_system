// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as facturas from "../../services/facturas.service";
import FacturaNueva from "./FacturaNueva";

// LA FACTURA DE «NUEVO DOCUMENTO» (doc 19 §9.21): de cero, sin evento. El
// RUT primero: si ya es la razón social de un cliente, se llena con su
// ficha y pide las referencias que ese cliente exige.

vi.mock("../../services/facturas.service", () => ({
  buscarRazonSocial: vi.fn(),
  revisarFacturaSinEvento: vi.fn(),
  emitirFacturaSinEvento: vi.fn(),
  armarBorradorDeDte: vi.fn(),
  emitirDte: vi.fn(),
  prepararDte: vi.fn(),
  revisarDte: vi.fn(),
}));
vi.mock("../../components/FileViewLink", () => ({
  default: ({ title }: { title: string }) => <span>{title}</span>,
}));
const f = vi.mocked(facturas);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VISTA: facturas.VistaPrevia = {
  ok: false,
  montos: { neto: 0, exento: 0, iva: 0, total: 0 },
  lineas: [],
  observaciones: [],
  avisos: [],
  problemas: [],
  faltan: [{ campo: "detalle:0", texto: "la descripción" }],
  folio: 43,
  fecha: "2026-11-06",
  emisor: { nombre: "Valle del Sol Quillón SpA", rut: null },
  ambiente: "simulado",
};

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FacturaNueva puedeEmitir onEmitida={() => {}} />
    </QueryClientProvider>,
  );

describe("La factura de «Nuevo documento»", () => {
  it("con un RUT que ya es de un cliente, se llena con su ficha y pide lo que ese cliente exige", async () => {
    f.buscarRazonSocial.mockResolvedValue({
      rut: "90413000-1",
      razon_social: "Compañía Cervecerías Unidas S.A.",
      giro: "Elaboración de cervezas",
      direccion: "Av. Vitacura 2670",
      comuna: "Las Condes",
      ciudad: "Santiago",
      correo_facturacion: "facturas@ccu.cl",
      referencias_exigidas: ["802"],
      cliente: "CCU",
    });
    f.revisarFacturaSinEvento.mockResolvedValue(VISTA);
    abrir();
    fireEvent.change(screen.getByPlaceholderText("12.345.678-9"), {
      target: { value: "90.413.000-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    expect(await screen.findByText("Factura nueva")).toBeInTheDocument();
    expect(f.buscarRazonSocial).toHaveBeenCalledWith("90413000-1");
    expect(f.revisarFacturaSinEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 33,
        orden_de_compra_id: null,
        receptor: expect.objectContaining({
          razon_social: "Compañía Cervecerías Unidas S.A.",
        }),
        referencias: [{ tipo: "802", folio: "", fecha: "" }],
      }),
    );
    expect(
      screen.getByText(/CCU pide también la nota de pedido/),
    ).toBeInTheDocument();
  });

  it("sin un RUT válido no sigue", () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText("12.345.678-9"), {
      target: { value: "90.413.000-2" },
    });
    expect(screen.getByRole("button", { name: "Seguir" })).toBeDisabled();
  });
});
