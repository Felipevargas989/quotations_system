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
// «Corregir» abre el documento con casillas (§9.32, `CorregirDte`); acá,
// uno que lo deja corregido por $119.000 y listo para aprobar.
vi.mock("./CorregirDte", () => ({
  default: ({
    quotationId,
    onCambio,
  }: {
    quotationId: string;
    onCambio: (r: {
      dte: revisar.RevisadoParaLaMasiva;
      listo: boolean;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCambio({
          dte: {
            tipo: 33,
            pedida: { ...pedida("CORREGIDA SPA"), tipo: 33 },
            vista: { ...vista(true), montos: MONTOS_CORREGIDOS },
          },
          listo: true,
        })
      }
    >
      corregir {quotationId}
    </button>
  ),
}));
const f = vi.mocked(facturas);
const r = vi.mocked(revisar);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MONTOS_CORREGIDOS = {
  neto: 100000,
  exento: 0,
  iva: 19000,
  total: 119000,
};

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
    for (const s of [
      "Documento",
      "Destinatario",
      "Ítems",
      "Referencias",
      "Totales",
    ])
      expect(screen.getByRole("heading", { name: s })).toBeInTheDocument();
    expect(
      screen.getByText(/801 · Orden de compra · N° 4500123/),
    ).toBeInTheDocument();
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
    // §9.33: el botón dice cuántas y por cuánto, y emite sin volver a
    // preguntar.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Facturar las 2 aprobadas · $1.190.000",
      }),
    );
    await waitFor(() => expect(onEmitidos).toHaveBeenCalled());
    expect(f.emitirDte).toHaveBeenCalledTimes(2);
    expect(f.emitirDte.mock.calls.map((c) => c[0])).toEqual([
      "ev-501",
      "ev-503",
    ]);
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

  it("«Corregir» abre el documento con casillas; lo corregido es lo que se aprueba y se emite (§9.32)", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("SIN GIRO SPA"),
      vista: vista(false),
    });
    f.emitirDte.mockResolvedValue(emitida(51));
    const onEmitidos = abrir([evento(501)]);
    await screen.findByText("SIN GIRO SPA");
    fireEvent.click(screen.getByRole("button", { name: /Corregir/ }));
    // Abajo, «Cancelar», «Listo» y «Aprobar» (apagado hasta que esté listo).
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "corregir ev-501" }));
    fireEvent.click(screen.getByRole("button", { name: /Aprobar/ }));
    // De vuelta al documento, con lo corregido.
    expect(await screen.findByText("CORREGIDA SPA")).toBeInTheDocument();
    expect(screen.getByText("1 de 1 · 1 aprobada")).toBeInTheDocument();
    expect(screen.getByText(/esta, aprobada/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Facturar la aprobada · $119.000" }),
    );
    await waitFor(() => expect(onEmitidos).toHaveBeenCalled());
    expect(f.emitirDte).toHaveBeenCalledWith(
      "ev-501",
      expect.objectContaining({
        receptor: expect.objectContaining({ razon_social: "CORREGIDA SPA" }),
      }),
    );
  });

  it("«Listo» vuelve al documento con lo corregido, sin aprobarlo (§9.32)", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("SIN GIRO SPA"),
      vista: vista(false),
    });
    abrir([evento(501)]);
    await screen.findByText("SIN GIRO SPA");
    fireEvent.click(screen.getByRole("button", { name: /Corregir/ }));
    fireEvent.click(screen.getByRole("button", { name: "corregir ev-501" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(await screen.findByText("CORREGIDA SPA")).toBeInTheDocument();
    expect(screen.getByText("1 de 1 · 0 aprobadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aprobar/ })).toBeEnabled();
  });

  it("la barra del evento cuenta lo emitido y las otras aprobadas, no las que no se aprueban (08-11)", async () => {
    const oc = (id: number, numero: string, total: number) => ({
      id,
      numero,
      total,
      facturado: 0,
      queda: total,
      estado: "pendiente" as const,
    });
    const totales: Record<number, number> = {
      4: 2_805_759,
      5: 2_640_600,
      6: 450_000,
    };
    r.revisarUnoParaLaMasiva.mockImplementation((_id, ocId) =>
      Promise.resolve({
        tipo: 33,
        pedida: { ...pedida(`OC ${ocId}`), orden_de_compra_id: ocId ?? null },
        vista: {
          ...vista(true),
          montos: { neto: 0, exento: 0, iva: 0, total: totales[ocId ?? 0] },
        },
      }),
    );
    abrir([
      evento(481, {
        total: 11_301_500,
        emitido: 2_805_800,
        queda: 8_495_700,
        ordenes: [
          oc(4, "33000132942", 5611559),
          oc(5, "32000066941", 5239858),
          oc(6, "33000132941", 450000),
        ],
      }),
    ]);
    expect(await screen.findByText("OC 4")).toBeInTheDocument();
    // La primera no se factura: se pasa sin aprobarla.
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByText("OC 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByText("OC 6")).toBeInTheDocument();
    // El evento: lo emitido ($2.805.800) y la segunda, aprobada
    // ($2.640.600); la primera, no.
    const facturado = screen
      .getAllByText("Facturado", { selector: "dt" })
      .map((dt) => dt.nextElementSibling?.textContent);
    expect(facturado[facturado.length - 1]).toBe("$5.446.400");
  });

  it("en «Documento», solo el tipo, la fecha de emisión y la condición de pago (08-11)", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("SOLO DOCUMENTO SPA"),
      vista: vista(true),
    });
    abrir([evento(501)]);
    expect(await screen.findByText("SOLO DOCUMENTO SPA")).toBeInTheDocument();
    expect(
      screen.queryByText("Cotización N° 501 · evento 06-12-2026"),
    ).not.toBeInTheDocument();
  });

  it("un evento con tres OC va en una factura por OC: se revisan y emiten aparte (Santo Tomás, 08-11)", async () => {
    const oc = (id: number, numero: string, total: number) => ({
      id,
      numero,
      total,
      facturado: 0,
      queda: total,
      estado: "pendiente" as const,
    });
    r.revisarUnoParaLaMasiva.mockImplementation((_id, ocId) =>
      Promise.resolve({
        tipo: 33,
        pedida: { ...pedida(`OC ${ocId}`), orden_de_compra_id: ocId ?? null },
        vista: vista(true),
      }),
    );
    f.emitirDte.mockResolvedValue(emitida(60));
    abrir([
      evento(481, {
        total: 11301500,
        queda: 11301500,
        ordenes: [
          oc(4, "33000132942", 5611559),
          oc(5, "32000066941", 5239858),
          oc(6, "33000132941", 450000),
        ],
      }),
    ]);
    // Una por OC: tres documentos del mismo evento, cada uno con su OC.
    expect(await screen.findByText("OC 4")).toBeInTheDocument();
    expect(screen.getByText(/1 de 3 · OC 33000132942/)).toBeInTheDocument();
    expect(
      r.revisarUnoParaLaMasiva.mock.calls.map((c) => [c[0], c[1]]),
    ).toEqual([
      ["ev-481", 4],
      ["ev-481", 5],
      ["ev-481", 6],
    ]);
    // BelIA lee el evento una sola vez: las tres comparten la preparación.
    const preparar = r.revisarUnoParaLaMasiva.mock.calls.map((c) => c[2]);
    expect(new Set(preparar).size).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByText("OC 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByText("OC 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Facturar las 3 aprobadas/ }),
    );
    await waitFor(() => expect(f.emitirDte).toHaveBeenCalledTimes(3));
    expect(f.emitirDte.mock.calls.map((c) => c[1].orden_de_compra_id)).toEqual([
      4, 5, 6,
    ]);
  });

  it("si una no sale, se detiene ahí y lo dice", async () => {
    r.revisarUnoParaLaMasiva.mockImplementation((id) =>
      Promise.resolve({
        tipo: 33,
        pedida: pedida(`RAZON ${id}`),
        vista: vista(true),
      }),
    );
    f.emitirDte.mockRejectedValueOnce(new Error("falla"));
    abrir([evento(501), evento(502)]);
    await screen.findByText("RAZON ev-501");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await screen.findByText("RAZON ev-502");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Facturar las 2 aprobadas/ }),
    );
    expect(
      await screen.findByText("No se emitió: se detuvo antes"),
    ).toBeInTheDocument();
    expect(f.emitirDte).toHaveBeenCalledTimes(1);
  });
});
