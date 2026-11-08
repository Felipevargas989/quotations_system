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
import RevisionDeLaFacturacion from "./RevisionDeLaFacturacion";

// «FACTURAR SELECCIONADOS» (doc 19 §9.31; Felipe, 08-11: *"así puedo
// revisar una por una (…) con la flecha arriba con un botón de corregir y
// un botón de aprobar y luego al final pinchar el facturar todas"*).

vi.mock("../../services/facturas.service", () => ({ emitirDte: vi.fn() }));
vi.mock("./revisarUnoParaLaMasiva", async (original) => ({
  ...(await original<typeof revisar>()),
  revisarUnoParaLaMasiva: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
// «Corregir» abre el «Emitir DTE» del evento; acá, uno que aprueba una
// factura corregida por $119.000.
vi.mock("../postventa/facturacion/EmitirDte", () => ({
  default: ({
    quotationId,
    alAprobar,
  }: {
    quotationId: string;
    alAprobar: (r: revisar.RevisadoParaLaMasiva) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        alAprobar({
          tipo: 33,
          pedida: { ...pedida("CORREGIDA SPA"), tipo: 33 },
          vista: { ...vista(true), montos: MONTOS_CORREGIDOS },
        })
      }
    >
      aprobar lo corregido de {quotationId}
    </button>
  ),
}));
const f = vi.mocked(facturas);
const r = vi.mocked(revisar);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MONTOS_CORREGIDOS = { neto: 100000, exento: 0, iva: 19000, total: 119000 };

const evento = (numero: number, extra = {}) => ({
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
  ...extra,
});

const pedida = (razon: string): facturas.DtePedido => ({
  tipo: 33,
  orden_de_compra_id: null,
  receptor: {
    rut: "76123456-0",
    razon_social: razon,
    giro: "SERVICIOS",
    direccion: "Calle 1",
    comuna: "Quillón",
    ciudad: "Quillón",
    correo: null,
  },
  lineas: [
    {
      descripcion: "Almuerzo",
      descripcion_larga: null,
      cantidad: 5,
      precio: 119000,
    },
  ],
  referencias: [{ tipo: "801", folio: "4500123", fecha: "2026-11-01" }],
  pedir_siempre: [],
});

const vista = (ok: boolean): facturas.VistaPrevia => ({
  ok,
  montos: { neto: 500000, exento: 0, iva: 95000, total: 595000 },
  lineas: [],
  observaciones: ["Cotización N° 501 · evento 06-12-2026"],
  avisos: [],
  problemas: [],
  faltan: ok ? [] : [{ campo: "giro", texto: "el giro" }],
  folio: 50,
  fecha: "2026-11-08",
  emisor: { nombre: null, rut: null },
  ambiente: "simulado",
});

const emitida = (folio: number) =>
  ({
    id: folio,
    tipo: 33,
    folio,
    estado: "emitido",
    ambiente: "simulado",
    total: 595000,
  }) as facturas.DocumentoTributario;

const abrir = (
  eventos: ReturnType<typeof evento>[],
  extra: Partial<Parameters<typeof RevisionDeLaFacturacion>[0]> = {},
) => {
  const onEmitidos = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RevisionDeLaFacturacion
        eventos={eventos}
        noLeidas={[]}
        onCerrar={() => {}}
        onEmitidos={onEmitidos}
        {...extra}
      />
    </QueryClientProvider>,
  );
  return onEmitidos;
};

describe("Facturar seleccionados: la revisión una por una", () => {
  it("con las flechas, aprueba y pasa al siguiente; al final factura solo las aprobadas", async () => {
    r.revisarUnoParaLaMasiva.mockImplementation((id) =>
      Promise.resolve({
        tipo: 33,
        pedida: pedida(`RAZON ${id}`),
        vista: vista(true),
      }),
    );
    f.emitirDte.mockResolvedValue(emitida(50));
    const onEmitidos = abrir([evento(501), evento(502), evento(503)]);
    // El documento, con las secciones de «Nuevo documento».
    expect(await screen.findByText("RAZON ev-501")).toBeInTheDocument();
    expect(screen.getByText("#501 · Cliente 501")).toBeInTheDocument();
    expect(screen.getByText("1 de 3 · 0 aprobadas")).toBeInTheDocument();
    for (const s of ["Documento", "Destinatario", "Ítems", "Referencias", "Totales"])
      expect(screen.getByRole("heading", { name: s })).toBeInTheDocument();
    expect(screen.getByText(/801 · Orden de compra · N° 4500123/)).toBeInTheDocument();
    // Aprobar pasa al siguiente.
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByText("RAZON ev-502")).toBeInTheDocument();
    expect(screen.getByText("2 de 3 · 1 aprobada")).toBeInTheDocument();
    // La 502 se salta con la flecha, sin aprobarla; la 503 se aprueba.
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByText("RAZON ev-503")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(screen.getByText(/esta, aprobada/)).toBeInTheDocument();
    // Volver con la flecha muestra la primera, ya aprobada.
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByRole("button", { name: "Aprobada" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Facturar las 2 aprobadas" }),
    );
    expect(
      screen.getByText(
        "¿Emitir 2 documentos por $1.190.000 en total? Emitidos no se borran.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, emitir" }));
    await waitFor(() => expect(onEmitidos).toHaveBeenCalled());
    expect(f.emitirDte).toHaveBeenCalledTimes(2);
    expect(f.emitirDte.mock.calls.map((c) => c[0])).toEqual(["ev-501", "ev-503"]);
    expect(screen.getAllByText(/Factura N° 50 emitida/)).toHaveLength(2);
  });

  it("lo que no está listo no se aprueba: «Lo del evento» dice qué le falta", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("SIN GIRO SPA"),
      vista: vista(false),
    });
    abrir([
      evento(501, {
        tiene_factura_en_documentos: true,
        ordenes: [
          {
            id: 1,
            numero: "4500123",
            total: 595000,
            facturado: 0,
            queda: 595000,
            estado: "pendiente",
          },
        ],
      }),
    ]);
    expect(await screen.findByText("SIN GIRO SPA")).toBeInTheDocument();
    expect(screen.getByText("Lo del evento")).toBeInTheDocument();
    expect(screen.getByText(/OC 4500123 · \$595\.000/)).toBeInTheDocument();
    expect(screen.getByText("Tiene factura en Documentos")).toBeInTheDocument();
    expect(
      screen.getByText("Falta el giro: corrígelo antes de aprobar"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Facturar las 0 aprobadas" }),
    ).toBeDisabled();
  });

  it("«Corregir» abre «Emitir DTE»; lo corregido es lo que se aprueba y se emite", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("SIN GIRO SPA"),
      vista: vista(false),
    });
    f.emitirDte.mockResolvedValue(emitida(51));
    const onEmitidos = abrir([evento(501)]);
    await screen.findByText("SIN GIRO SPA");
    fireEvent.click(screen.getByRole("button", { name: /Corregir/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "aprobar lo corregido de ev-501" }),
    );
    // De vuelta al documento, con lo corregido.
    expect(await screen.findByText("CORREGIDA SPA")).toBeInTheDocument();
    expect(screen.getByText("1 de 1 · 1 aprobada")).toBeInTheDocument();
    expect(screen.getByText(/esta, aprobada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Facturar la aprobada" }));
    expect(
      screen.getByText(
        "¿Emitir 1 documento por $119.000 en total? Emitidos no se borran.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, emitir" }));
    await waitFor(() => expect(onEmitidos).toHaveBeenCalled());
    expect(f.emitirDte).toHaveBeenCalledWith(
      "ev-501",
      expect.objectContaining({
        receptor: expect.objectContaining({ razon_social: "CORREGIDA SPA" }),
      }),
    );
  });

  it("si una no sale, se detiene ahí y lo dice", async () => {
    r.revisarUnoParaLaMasiva.mockImplementation((id) =>
      Promise.resolve({ tipo: 33, pedida: pedida(`RAZON ${id}`), vista: vista(true) }),
    );
    f.emitirDte.mockRejectedValueOnce(new Error("falla"));
    abrir([evento(501), evento(502)]);
    await screen.findByText("RAZON ev-501");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await screen.findByText("RAZON ev-502");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Facturar las 2 aprobadas" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, emitir" }));
    expect(
      await screen.findByText("No se emitió: se detuvo antes"),
    ).toBeInTheDocument();
    expect(f.emitirDte).toHaveBeenCalledTimes(1);
  });
});
