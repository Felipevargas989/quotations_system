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
import ListaDeDocumentos from "./ListaDeDocumentos";

// LA LISTA DE FACTURACIÓN COMO LA MAQUETA (doc 19 §9.22, sprint 2): el
// resumen sigue a los filtros, el buscador por N°, cliente o RUT, el tipo,
// el estado y el rango de fechas, y cada documento con sus acciones.

vi.mock("../../services/documentosTributarios.service", () => ({
  getListaDeFacturacion: vi.fn(),
  comprobarDocumento: vi.fn(),
  pedirPdfDelDocumento: vi.fn(),
}));
vi.mock("../../services/storage.service", () => ({
  descargarArchivo: vi.fn(),
  resolveStorageUrl: vi.fn(),
}));
vi.mock("../../utils/dates", async (original) => ({
  ...(await original<typeof import("../../utils/dates")>()),
  hoyEnChile: () => "2026-11-06",
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}));
vi.mock("./ProbarLaConexion", () => ({
  default: () => <p>probar la conexión</p>,
}));
const d = vi.mocked(documentos);

const base: DocumentoDeLaLista = {
  id: 0,
  tipo: 33,
  folio: 0,
  fecha_emision: "2026-11-06",
  estado: "emitido",
  ambiente: "prueba",
  titulo: "",
  reemplaza: null,
  cliente: null,
  total: 0,
  neto: 0,
  iva: 0,
  numero: null,
  quotation_id: null,
  oc: null,
  modifica_id: null,
  cadena: { como: "vigente", texto: "Vigente" },
  situacion: "vigente",
  rut: null,
  referencia: null,
  forma_de_pago: null,
  vencimiento: null,
  plazo_dias: null,
  pdf_path: "c1/documentos-tributarios/x.pdf",
  error: null,
  acciones: {
    anular: false,
    rebajar: false,
    corregir: false,
    comprobar: false,
    pedirPdf: false,
  },
  saldo: null,
  plazos: null,
};

const DOCS: DocumentoDeLaLista[] = [
  {
    ...base,
    id: 20,
    folio: 20,
    titulo: "Factura 20",
    cliente: "Compañía Cervecerías Unidas S.A.",
    rut: "90413000-1",
    neto: 100000,
    iva: 19000,
    total: 119000,
    cadena: { como: "rebajado", texto: "Rebajada: queda $107.100" },
    situacion: "rebajada",
    referencia: { tipo: "801", folio: "4500-112" },
    forma_de_pago: 2,
    vencimiento: "2026-12-06",
    plazo_dias: 30,
    acciones: { ...base.acciones, anular: true, rebajar: true },
  },
  {
    ...base,
    id: 21,
    tipo: 61,
    folio: 3,
    titulo: "NC 3 · rebaja la 20",
    cliente: "Compañía Cervecerías Unidas S.A.",
    rut: "90413000-1",
    neto: -10000,
    iva: -1900,
    total: -11900,
    modifica_id: 20,
    cadena: { como: "vigente", texto: "Código 3 · 06-11" },
    situacion: "nota",
  },
  {
    ...base,
    id: 22,
    tipo: 39,
    folio: 500,
    titulo: "Boleta 500",
    cliente: "Cabaña 4",
    neto: 21008,
    iva: 3992,
    total: 25000,
  },
  {
    ...base,
    id: 23,
    folio: null,
    fecha_emision: null,
    estado: "por_confirmar",
    titulo: "Factura s/n",
    cliente: "Constructora Cerro Negro SpA",
    rut: "77052981-6",
    neto: 42017,
    iva: 7983,
    total: 50000,
    cadena: { como: "vigente", texto: "Por confirmar" },
    situacion: "por_confirmar",
    pdf_path: null,
    acciones: { ...base.acciones, comprobar: true },
  },
];

beforeEach(() => {
  d.getListaDeFacturacion.mockResolvedValue({
    ambiente: "prueba",
    mes: "2026-11",
    desde: "2026-11-01",
    hasta: "2026-11-30",
    hoy: "2026-11-06",
    resumen: {
      facturado: 0,
      facturas: 0,
      boletas: 0,
      notas: 0,
      porConfirmar: 0,
    },
    documentos: DOCS,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const modificar = vi.fn();
const abrir = (conAjustes = false) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ListaDeDocumentos
        conAjustes={conAjustes}
        recien={22}
        onModificar={modificar}
      />
    </QueryClientProvider>,
  );

const elegir = (actual: string, opcion: string) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(actual) }));
  fireEvent.click(screen.getByRole("button", { name: opcion }));
};

const resumen = () =>
  screen.getByRole("region", { name: "Resumen" }).textContent ?? "";

describe("la lista de Facturación (§9.22)", () => {
  it("pide este mes al motor, y el resumen suma lo que se ve (lo por confirmar, aparte)", async () => {
    abrir();
    await screen.findByText("Factura 20");
    expect(d.getListaDeFacturacion).toHaveBeenCalledWith({
      desde: "2026-11-01",
      hasta: "2026-11-30",
    });
    expect(resumen()).toContain("$111.008");
    expect(resumen()).toContain("$21.092");
    expect(resumen()).toContain("$132.100");
    expect(resumen()).toContain("1 factura · 1 boleta · 1 nota");
    expect(resumen()).toMatch(/Por confirmar1/);

    elegir("Todos los tipos", "Boletas");
    expect(resumen()).toContain("$25.000");
    expect(resumen()).toContain("0 facturas · 1 boleta · 0 notas");
    expect(screen.queryByText("Factura 20")).not.toBeInTheDocument();
  });

  it("busca por N°, por cliente sin tildes y por RUT con puntos", async () => {
    abrir();
    await screen.findByText("Factura 20");
    const buscar = screen.getByPlaceholderText("Buscar por N° o cliente");
    fireEvent.change(buscar, { target: { value: "500" } });
    expect(screen.getByText("Boleta 500")).toBeInTheDocument();
    expect(screen.queryByText("Factura 20")).not.toBeInTheDocument();
    fireEvent.change(buscar, { target: { value: "compania cervecerias" } });
    expect(screen.getByText("Factura 20")).toBeInTheDocument();
    expect(screen.queryByText("Boleta 500")).not.toBeInTheDocument();
    fireEvent.change(buscar, { target: { value: "77.052.981" } });
    expect(screen.getByText("Factura s/n")).toBeInTheDocument();
    expect(screen.queryByText("Factura 20")).not.toBeInTheDocument();
  });

  it("cada uno con su estado, su condición de pago, su OC y sus notas debajo", async () => {
    abrir();
    await screen.findByText("Factura 20");
    expect(screen.getByText("Rebajada: queda $107.100")).toBeInTheDocument();
    expect(
      screen.getByText("Crédito 30 días · vence 06-12"),
    ).toBeInTheDocument();
    expect(screen.getByText("06-11-2026 · OC 4500-112")).toBeInTheDocument();
    // La NC va debajo de su factura.
    const filas = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const i = filas.findIndex((t) => t.includes("Factura 20"));
    expect(filas[i + 1]).toContain("└ NC 3 · rebaja la 20");
    expect(screen.getByText("−$11.900")).toBeInTheDocument();
    // Lo que espera «Comprobar», primero; sin PDF, sin ver ni descargar.
    expect(filas[1]).toContain("Factura s/n");
    expect(
      screen.getByRole("button", { name: "Comprobar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Descargar el PDF de Factura s\/n/ }),
    ).toBeDisabled();
    // El XML: un servicio adicional de facturacion.cl, sin prometerlo.
    for (const x of screen.getAllByRole("button", {
      name: "El XML: servicio adicional de facturacion.cl",
    }))
      expect(x).toBeDisabled();
    // «Anular o rebajar…» abre la nota en su pantalla, con la factura ya
    // elegida (sprint 3).
    fireEvent.click(screen.getByRole("button", { name: "Anular o rebajar…" }));
    expect(modificar).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
    // El recién emitido, marcado.
    expect(screen.getByText("Boleta 500").closest("tr")).toHaveClass(
      "bg-green-50",
    );
  });

  it("sin nada con esos filtros, «Limpiar los filtros» vuelve a todo", async () => {
    abrir();
    await screen.findByText("Factura 20");
    elegir("Todos los estados", "Anuladas");
    expect(
      screen.getByText(/No hay documentos con estos filtros/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Limpiar los filtros" }),
    );
    expect(screen.getByText("Factura 20")).toBeInTheDocument();
  });

  it("el rango de fechas va al motor; al revés no se pide", async () => {
    const { container } = abrir();
    await screen.findByText("Factura 20");
    const [desde, hasta] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(desde, { target: { value: "2026-10-01" } });
    await waitFor(() =>
      expect(d.getListaDeFacturacion).toHaveBeenLastCalledWith({
        desde: "2026-10-01",
        hasta: "2026-11-30",
      }),
    );
    const llamadas = d.getListaDeFacturacion.mock.calls.length;
    fireEvent.change(hasta, { target: { value: "2026-09-01" } });
    expect(
      screen.getByText("La fecha «desde» va antes que «hasta»."),
    ).toBeInTheDocument();
    expect(d.getListaDeFacturacion.mock.calls.length).toBe(llamadas);
  });

  it("«Recibidos» dice que facturacion.cl no los entrega, y la conexión solo con su permiso", async () => {
    abrir(true);
    await screen.findByText("Factura 20");
    expect(screen.getByText("probar la conexión")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recibidos" }));
    expect(
      screen.getByText(/facturacion.cl no las entrega por su integración/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Factura 20")).not.toBeInTheDocument();
  });
});
