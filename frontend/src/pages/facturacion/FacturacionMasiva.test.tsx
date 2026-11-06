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
import * as facturas from "../../services/facturas.service";
import * as revisar from "./revisarUnoParaLaMasiva";
import FacturacionMasiva from "./FacturacionMasiva";

// LA FACTURACIÓN MASIVA (doc 19 §9.21): BelIA arma el DTE de cada evento
// marcado; los listos se emiten juntos con una sola confirmación, y los
// que no, dicen qué les falta.

vi.mock("../../services/facturas.service", () => ({ emitirDte: vi.fn() }));
vi.mock("./revisarUnoParaLaMasiva", async (original) => ({
  ...(await original<typeof revisar>()),
  revisarUnoParaLaMasiva: vi.fn(),
}));
const f = vi.mocked(facturas);
const r = vi.mocked(revisar);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const evento = (numero: number) => ({
  id: `ev-${numero}`,
  numero,
  estado: "aceptada",
  tipoDeEvento: null,
  fecha: "2026-12-06",
  cliente: `Cliente ${numero}`,
  total: 595000,
  emitido: 0,
  queda: 595000,
  ocs: 0,
});

const vista = (ok: boolean): facturas.VistaPrevia => ({
  ok,
  montos: { neto: 500000, exento: 0, iva: 95000, total: 595000 },
  lineas: [],
  observaciones: [],
  avisos: [],
  problemas: [],
  faltan: ok ? [] : [{ campo: "giro", texto: "el giro" }],
  folio: 50,
  fecha: "2026-11-06",
  emisor: { nombre: null, rut: null },
  ambiente: "simulado",
});

describe("La facturación masiva", () => {
  it("emite juntas las listas y deja las que no, con lo que les falta", async () => {
    r.revisarUnoParaLaMasiva.mockImplementation((id) =>
      Promise.resolve({
        tipo: 33,
        pedida: { tipo: 33 } as facturas.DtePedido,
        vista: vista(id !== "ev-502"),
      }),
    );
    f.emitirDte.mockResolvedValue({
      id: 9,
      tipo: 33,
      folio: 50,
      estado: "emitido",
      ambiente: "simulado",
      total: 595000,
    } as facturas.DocumentoTributario);
    const onEmitidos = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FacturacionMasiva
          eventos={[evento(501), evento(502)]}
          onCerrar={() => {}}
          onEmitidos={onEmitidos}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("Falta el giro: factúralo uno por uno"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Emitir la lista" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, emitir" }));
    await waitFor(() => expect(onEmitidos).toHaveBeenCalled());
    expect(f.emitirDte).toHaveBeenCalledTimes(1);
    expect(f.emitirDte).toHaveBeenCalledWith("ev-501", { tipo: 33 });
    expect(
      screen.getByText(/Factura N° 50 emitida \(simulada\)/),
    ).toBeInTheDocument();
  });
});
