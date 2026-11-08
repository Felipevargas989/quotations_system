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
// La nómina del SII (§9.27) tiene sus propias pruebas.
vi.mock("./NominaDelSii", () => ({ default: () => null }));
const d = vi.mocked(documentos);

const base: DocumentoDeLaLista = {
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
    nombre: "Factura 20",
    cliente: "Compañía Cervecerías Unidas S.A.",
    rut: "90413000-1",
    neto: 100000,
    iva: 19000,
    total: 119000,
    cadena: {
      como: "rebajado",
      texto: "Rebajada",
      detalle: "−$11.900",
    },
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
    nombre: "NC 3",
    que_hace: "rebaja la 20",
    cliente: "Compañía Cervecerías Unidas S.A.",
    rut: "90413000-1",
    neto: -10000,
    iva: -1900,
    total: -11900,
    modifica_id: 20,
    cadena: { como: "vigente", texto: "Vigente", detalle: null },
    situacion: "nota",
  },
  {
    ...base,
    id: 22,
    tipo: 39,
    folio: 500,
    titulo: "Boleta 500",
    nombre: "Boleta 500",
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
    nombre: "Factura s/n",
    cliente: "Constructora Cerro Negro SpA",
    rut: "77052981-6",
    neto: 42017,
    iva: 7983,
    total: 50000,
    cadena: { como: "vigente", texto: "Por confirmar", detalle: null },
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
    // El chip en una palabra; abajo, cuánto se rebajó y cuándo vence.
    expect(screen.getByText("Rebajada")).toBeInTheDocument();
    expect(screen.getByText("−$11.900 · vence 06-12")).toBeInTheDocument();
    expect(screen.getByText("06-11-2026 · OC 4500-112")).toBeInTheDocument();
    // La NC va debajo de su factura; lo que hace, junto a la fecha.
    const filas = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const i = filas.findIndex((t) => t.includes("Factura 20"));
    expect(filas[i + 1]).toContain("└ NC 3");
    expect(screen.getByText("06-11-2026 · rebaja la 20")).toBeInTheDocument();
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
    // «Anular o rebajar…» es un botón más de Acciones, sin texto debajo
    // (07-11), y abre la nota en su pantalla con la factura ya elegida.
    expect(screen.queryByText("Anular o rebajar…")).not.toBeInTheDocument();
    const anular = screen.getByRole("button", { name: "Anular o rebajar…" });
    expect(anular).toHaveAttribute("title", "Anular o rebajar…");
    expect(anular.parentElement).toContainElement(
      screen.getByRole("button", { name: "Descargar el PDF de Factura 20" }),
    );
    fireEvent.click(anular);
    expect(modificar).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
    // El recién emitido, marcado.
    expect(screen.getByText("Boleta 500").closest("tr")).toHaveClass(
      "bg-green-50",
    );
  });

  it("el estado en una palabra y abajo lo que lo cambió, sin partirse (07-11)", async () => {
    const credito = {
      forma_de_pago: 2 as const,
      vencimiento: "2026-12-06",
      plazo_dias: 30,
    };
    d.getListaDeFacturacion.mockResolvedValueOnce({
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
      documentos: [
        { ...base, id: 1, folio: 1, nombre: "Factura 1", ...credito },
        {
          ...base,
          id: 2,
          folio: 2,
          nombre: "Factura 2",
          forma_de_pago: 1,
        },
        {
          ...base,
          id: 3,
          folio: 3,
          nombre: "Factura 3",
          ...credito,
          cadena: { como: "anulado", texto: "Anulada", detalle: "Por NC 9" },
          situacion: "anulada",
        },
        {
          ...base,
          id: 4,
          folio: 4,
          nombre: "Factura 4",
          ...credito,
          cadena: {
            como: "corregido",
            texto: "Vigente",
            detalle: "Corregida por NC 5",
          },
        },
      ],
    });
    abrir();
    await screen.findByText("Factura 1");
    // Vigente con su condición de pago; la anulada, solo la nota que la
    // anuló; la corregida vale entera, con la nota y el vencimiento.
    expect(
      screen.getByText("Crédito 30 días · vence 06-12"),
    ).toBeInTheDocument();
    expect(screen.getByText("Contado")).toBeInTheDocument();
    expect(screen.getByText("Anulada")).toBeInTheDocument();
    expect(screen.getByText("Por NC 9")).toBeInTheDocument();
    expect(
      screen.getByText("Corregida por NC 5 · vence 06-12"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Vigente")).toHaveLength(3);
    // El chip y la línea de abajo no se parten.
    expect(screen.getByText("Anulada")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("Por NC 9")).toHaveClass("whitespace-nowrap");
  });

  it("las notas con una sola sangría, y lo anulado achurado (no la nota que anula)", async () => {
    const lista = (documentos: DocumentoDeLaLista[]) => ({
      ambiente: "prueba" as const,
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
      documentos,
    });
    d.getListaDeFacturacion.mockResolvedValueOnce(
      lista([
        // La factura vuelve a estar vigente: la ND anuló la NC que la anulaba.
        { ...base, id: 1, folio: 1, nombre: "Factura 1" },
        {
          ...base,
          id: 2,
          tipo: 61,
          folio: 2,
          nombre: "NC 2",
          que_hace: "anula la 1",
          modifica_id: 1,
          cadena: { como: "anulado", texto: "Anulada", detalle: "Por ND 3" },
          situacion: "anulada",
        },
        {
          ...base,
          id: 3,
          tipo: 56,
          folio: 3,
          nombre: "ND 3",
          que_hace: "anula la NC 2",
          modifica_id: 2,
          situacion: "nota",
        },
        // La factura anulada y la NC que la anula.
        {
          ...base,
          id: 4,
          folio: 4,
          nombre: "Factura 4",
          cadena: { como: "anulado", texto: "Anulada", detalle: "Por NC 5" },
          situacion: "anulada",
        },
        {
          ...base,
          id: 5,
          tipo: 61,
          folio: 5,
          nombre: "NC 5",
          que_hace: "anula la 4",
          modifica_id: 4,
          situacion: "nota",
        },
      ]),
    );
    abrir();
    const fila = async (nombre: string) =>
      (await screen.findByText(nombre)).closest("tr") as HTMLElement;
    const sangria = (tr: HTMLElement) =>
      (tr.querySelector("td") as HTMLElement).style.paddingLeft;
    // La ND que anula la NC va a la misma distancia que la NC: sin cascada.
    expect(sangria(await fila("NC 2"))).toBe("1.25rem");
    expect(sangria(await fila("ND 3"))).toBe("1.25rem");
    const orden = screen
      .getAllByRole("row")
      .map((r) => r.querySelector("td p")?.textContent ?? "")
      .filter(Boolean);
    expect(orden.indexOf("└ ND 3")).toBe(orden.indexOf("└ NC 2") + 1);
    // Achurado lo anulado (la NC 2 y la Factura 4); la NC 5 que anula, no.
    expect(await fila("NC 2")).toHaveAttribute("data-achurado");
    expect(await fila("Factura 4")).toHaveAttribute("data-achurado");
    expect(await fila("NC 5")).not.toHaveAttribute("data-achurado");
    expect(await fila("Factura 1")).not.toHaveAttribute("data-achurado");
  });

  it("con un motor de antes (sin el nombre ni el detalle), se ve como antes", async () => {
    const viejo = { ...base, nombre: undefined, que_hace: undefined };
    d.getListaDeFacturacion.mockResolvedValueOnce({
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
      documentos: [
        {
          ...viejo,
          id: 5,
          tipo: 61,
          folio: 5,
          titulo: "NC 5 · anula la 4",
          cadena: { como: "anulado", texto: "Anulada por ND 1" },
          situacion: "anulada",
        },
      ],
    });
    abrir();
    expect(await screen.findByText("NC 5 · anula la 4")).toBeInTheDocument();
    expect(screen.getByText("Anulada por ND 1")).toBeInTheDocument();
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
