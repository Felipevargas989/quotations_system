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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as documentos from "../../services/documentosTributarios.service";
import type { DocumentoDeLaLista } from "../../services/documentosTributarios.service";
import NotaNueva from "./NotaNueva";

// LAS NOTAS EN SU PROPIA PANTALLA (doc 19 §9.22, sprint 3), como la
// maqueta: primero qué documento modifica, después cómo, y la vista previa
// con lo que modifica antes de emitir.

vi.mock("../../services/documentosTributarios.service", () => ({
  getListaDeFacturacion: vi.fn(),
  revisarNota: vi.fn(),
  emitirNota: vi.fn(),
}));
vi.mock("../../utils/dates", async (original) => ({
  ...(await original<typeof import("../../utils/dates")>()),
  hoyEnChile: () => "2026-11-06",
  hoyEnChileMas: () => "2025-11-06",
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}));
const d = vi.mocked(documentos);

const sinAcciones = {
  anular: false,
  rebajar: false,
  corregir: false,
  comprobar: false,
  pedirPdf: false,
};
const doc = (x: Partial<DocumentoDeLaLista>): DocumentoDeLaLista => ({
  id: 0,
  tipo: 33,
  folio: 0,
  fecha_emision: "2026-11-06",
  estado: "emitido",
  ambiente: "prueba",
  titulo: "",
  nombre: "",
  que_hace: null,
  reemplaza: null,
  cliente: null,
  total: 0,
  neto: 0,
  iva: 0,
  numero: null,
  quotation_id: null,
  oc: null,
  modifica_id: null,
  cadena: { como: "vigente", texto: "Vigente", detalle: null },
  situacion: "vigente",
  rut: null,
  referencia: null,
  forma_de_pago: null,
  vencimiento: null,
  plazo_dias: null,
  pdf_path: null,
  error: null,
  acciones: sinAcciones,
  saldo: null,
  plazos: { anular: "2026-12-31", rebajar: "2027-05-06" },
  ...x,
});

const FACTURA = doc({
  id: 20,
  folio: 20,
  titulo: "Factura 20",
  cliente: "Compañía Cervecerías Unidas S.A.",
  rut: "90413000-1",
  total: 119000,
  saldo: 119000,
  acciones: { ...sinAcciones, anular: true, rebajar: true, corregir: true },
});
const REBAJADA = doc({
  ...FACTURA,
  id: 21,
  folio: 21,
  titulo: "Factura 21",
  saldo: 50000,
  acciones: { ...sinAcciones, rebajar: true, corregir: true },
});
const ANULADA = doc({
  id: 22,
  folio: 22,
  titulo: "Factura 22",
  cliente: "Constructora Cerro Negro SpA",
  total: 300000,
});
const NC = doc({
  id: 30,
  tipo: 61,
  folio: 3,
  titulo: "NC 3 · anula la 23",
  cliente: "Fundación Ñuble Verde",
  total: -50000,
  acciones: { ...sinAcciones, anular: true },
});

beforeEach(() => {
  d.getListaDeFacturacion.mockResolvedValue({
    ambiente: "prueba",
    mes: "2025-11",
    desde: "2025-11-06",
    hasta: "2026-11-06",
    hoy: "2026-11-06",
    resumen: {
      facturado: 0,
      facturas: 0,
      boletas: 0,
      notas: 0,
      porConfirmar: 0,
    },
    documentos: [FACTURA, REBAJADA, ANULADA, NC],
  });
  d.revisarNota.mockResolvedValue({
    ok: true,
    problemas: [],
    avisos: [],
    tipo: 61,
    folio: 5,
    fecha: "2026-11-06",
    codigo: 3,
    modifica: "Factura 20",
    referencia: {
      tipo: "33",
      folio: "20",
      fecha: "2026-11-06",
      codigo: 3,
      razon: "Vinieron 5 personas menos",
    },
    emisor: { nombre: "Valle del Sol Quillón SpA", rut: "77701305-K" },
    plazo: "2027-05-06",
    montos: { neto: 8403, exento: 0, iva: 1597, total: 10000 },
    lineas: [
      {
        descripcion: "Rebaja: Vinieron 5 personas menos",
        cantidad: 1,
        precio: 8403,
      },
    ],
    receptor: {
      rut: "90413000-1",
      razon_social: "Compañía Cervecerías Unidas S.A.",
      giro: "Elaboración de cervezas",
      direccion: "Av. Vitacura 2670",
      comuna: "Las Condes",
      ciudad: "Santiago",
      correo: null,
    },
    ambiente: "prueba",
  });
  d.emitirNota.mockResolvedValue({
    id: 99,
    estado: "emitido",
    folio: 5,
    tipo: 61,
    total: 10000,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const abrir = (
  tipo: "nota_credito" | "nota_debito",
  inicial: DocumentoDeLaLista | null = null,
) => {
  const onEmitida = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotaNueva
        tipo={tipo}
        inicial={inicial}
        onVolver={() => {}}
        onEmitida={onEmitida}
      />
    </QueryClientProvider>,
  );
  return { onEmitida };
};

describe("la nota nueva (§9.22, sprint 3)", () => {
  it("la de crédito busca entre las facturas y las notas del último año que la admiten", async () => {
    abrir("nota_credito");
    expect(screen.getByText("¿Qué factura modifica?")).toBeInTheDocument();
    await screen.findByText("Factura 20");
    expect(d.getListaDeFacturacion).toHaveBeenCalledWith({
      desde: "2025-11-06",
      hasta: "2026-11-06",
      tipos: [33, 56, 61],
    });
    // La anulada ya no admite nota; la NC no se modifica con otra NC.
    expect(screen.queryByText("Factura 22")).not.toBeInTheDocument();
    expect(screen.queryByText("NC 3 · anula la 23")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Buscar por N° o cliente"), {
      target: { value: "21" },
    });
    expect(screen.queryByText("Factura 20")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Factura 21"));
    expect(screen.getByText("La factura")).toBeInTheDocument();
    // Una rebajada ya no se anula entera: parte en «Rebajar un monto».
    expect(
      screen.queryByRole("button", { name: /Anular completa/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Rebajar un monto/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("la de débito anula una nota de crédito", async () => {
    abrir("nota_debito");
    expect(screen.getByText("¿Qué nota de crédito anula?")).toBeInTheDocument();
    fireEvent.click(await screen.findByText("NC 3 · anula la 23"));
    expect(screen.getByText("La nota de crédito")).toBeInTheDocument();
    expect(
      screen.getByText(/La nota de débito anula la nota de crédito/),
    ).toBeInTheDocument();
  });

  it("rebajar: nunca más de lo que le queda; la vista previa dice lo que modifica y «Emitir» emite (§9.33)", async () => {
    const { onEmitida } = abrir("nota_credito", FACTURA);
    expect(d.getListaDeFacturacion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Rebajar un monto/ }));
    fireEvent.change(
      screen.getByPlaceholderText("Ej.: Vinieron 20 personas menos"),
      { target: { value: "Vinieron 5 personas menos" } },
    );
    const monto = screen.getByPlaceholderText("0");
    fireEvent.change(monto, { target: { value: "200000" } });
    expect(
      screen.getByText("Falta un monto entre $1 y $119.000."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crear documento" }),
    ).toBeDisabled();
    fireEvent.change(monto, { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));

    await screen.findByText("Así sale la nota de crédito");
    expect(d.revisarNota).toHaveBeenCalledWith(20, {
      accion: "rebajar",
      motivo: "Vinieron 5 personas menos",
      monto: 10000,
      receptor: null,
    });
    expect(
      screen.getByText(
        "Corrige el monto de la factura electrónica N° 20 del 06-11-2026 · Vinieron 5 personas menos",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Emitir nota de crédito" }),
    );
    await waitFor(() =>
      expect(onEmitida).toHaveBeenCalledWith(
        expect.objectContaining({ id: 99, folio: 5 }),
      ),
    );
  });
});
