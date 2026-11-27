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

vi.mock("../../services/facturas.service", () => ({
  emitirDte: vi.fn(),
  // §9.48: lo aprobado se guarda y lo guardado se revisa de nuevo al abrir.
  guardarAprobada: vi.fn().mockResolvedValue({}),
  quitarAprobada: vi.fn().mockResolvedValue(undefined),
  revisarDte: vi.fn(),
}));
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
  f.guardarAprobada.mockResolvedValue({} as facturas.FacturaAprobada);
  f.quitarAprobada.mockResolvedValue(undefined);
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
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
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
    // Aprobar pasa al siguiente, y la deja guardada (§9.48).
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByText("RAZON ev-502")).toBeInTheDocument();
    expect(f.guardarAprobada).toHaveBeenCalledWith(
      "ev-501",
      null,
      pedida("RAZON ev-501"),
      "aprobada",
    );
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
    // La 502 se salta con la flecha, sin aprobarla; la 503 se aprueba.
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByText("RAZON ev-503")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(screen.getAllByText("Aprobada").length).toBeGreaterThan(0);
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
    expect(screen.getByText("1 de 1")).toBeInTheDocument();
    expect(screen.getAllByText("Aprobada").length).toBeGreaterThan(0);
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
    expect(screen.getByText("1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aprobar/ })).toBeEnabled();
  });

  it("con OC, la OC va como lista de sus facturas y el evento en una línea (§9.60)", async () => {
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
    // Sale la barra del evento: una línea con su total y lo ya emitido.
    expect(screen.queryByText("Facturado", { selector: "dt" })).toBeNull();
    expect(
      screen.getByText(/Evento #481 · \$11\.301\.500 · esta OC es el 4 %/),
    ).toBeInTheDocument();
    expect(screen.getByText(/ya emitido \$2\.805\.800/)).toBeInTheDocument();
    // La OC de esta factura, con su fila «Revisando» por $450.000.
    expect(screen.getByText("OC 33000132941")).toBeInTheDocument();
    expect(screen.getByText("Por revisar")).toBeInTheDocument();
    expect(screen.getAllByText("$450.000").length).toBeGreaterThan(0);
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
    // §9.60: el subtítulo sin la OC; la OC va en la lista.
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
    expect(screen.getByText("OC 33000132942")).toBeInTheDocument();
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

  // §9.59: la OC de Transportes CCU (#407) trae 4 líneas y una nota de
  // pedido por línea: una factura por línea, cada una guardada aparte.
  it("la OC que va en una factura por línea: un documento por línea, cada uno con su línea", async () => {
    r.revisarUnoParaLaMasiva.mockImplementation((_id, ocId, _p, linea) =>
      Promise.resolve({
        tipo: 33,
        pedida: {
          ...pedida(`LINEA ${linea}`),
          orden_de_compra_id: ocId ?? null,
          linea_de_la_oc: linea ?? null,
        },
        vista: vista(true),
      }),
    );
    f.emitirDte.mockResolvedValue(emitida(70));
    abrir([
      evento(407, {
        total: 19262800,
        queda: 19262800,
        ordenes: [
          {
            id: 16,
            numero: "4505522493",
            total: 5375997,
            facturado: 0,
            queda: 5375997,
            estado: "pendiente" as const,
            lineas_por_facturar: [0, 1, 2, 3],
          },
        ],
      }),
    ]);
    expect(await screen.findByText("LINEA 0")).toBeInTheDocument();
    // §9.60: la OC y sus 4 líneas en la lista; el subtítulo, corto.
    expect(screen.getByText("1 de 4")).toBeInTheDocument();
    expect(screen.getByText("OC 4505522493")).toBeInTheDocument();
    expect(screen.getByText("Línea 10")).toBeInTheDocument();
    expect(screen.getByText("Línea 40")).toBeInTheDocument();
    expect(
      r.revisarUnoParaLaMasiva.mock.calls.map((c) => [c[1], c[3]]),
    ).toEqual([
      [16, 0],
      [16, 1],
      [16, 2],
      [16, 3],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    // Cada una se guarda con su línea: las cuatro esperan juntas.
    await waitFor(() =>
      expect(f.guardarAprobada).toHaveBeenCalledWith(
        "ev-407",
        16,
        expect.objectContaining({ linea_de_la_oc: 0 }),
        "aprobada",
      ),
    );
    for (const linea of [1, 2, 3]) {
      expect(await screen.findByText(`LINEA ${linea}`)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    }
    await waitFor(() => expect(f.guardarAprobada).toHaveBeenCalledTimes(4));
    fireEvent.click(
      screen.getByRole("button", { name: /Facturar las 4 aprobadas/ }),
    );
    await waitFor(() => expect(f.emitirDte).toHaveBeenCalledTimes(4));
    expect(f.emitirDte.mock.calls.map((c) => c[1].linea_de_la_oc)).toEqual([
      0, 1, 2, 3,
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
  // §9.48 (Felipe, 11-11: *"ya revisé y dejé la facturación hecha (…) la
  // próxima persona, cuando decida facturar, la factura está lista, llegar
  // y pinchar no más"*).
  const GUARDADA: facturas.FacturaAprobada = {
    quotation_id: "ev-501",
    oc_id: null,
    pedida: pedida("GUARDADA SPA"),
    aprobada_por_nombre: "Camila Soto",
    aprobada_en: "2026-11-10T15:00:00Z",
  };

  it("lo aprobado otro día abre ya aprobado, con quién lo aprobó, listo para facturar (§9.48)", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("LO DE BELIA"),
      vista: vista(true),
    });
    f.revisarDte.mockResolvedValue(vista(true));
    f.emitirDte.mockResolvedValue(emitida(51));
    const onEmitidos = abrir([evento(501)], { aprobadas: [GUARDADA] });
    // El documento es el guardado, no lo que BelIA armaría hoy.
    expect(await screen.findByText("GUARDADA SPA")).toBeInTheDocument();
    expect(screen.queryByText("LO DE BELIA")).toBeNull();
    // El motor lo revisó de nuevo con lo guardado.
    expect(f.revisarDte).toHaveBeenCalledWith("ev-501", GUARDADA.pedida);
    expect(screen.getByText("1 de 1")).toBeInTheDocument();
    expect(screen.getByText(/Camila Soto · 10 nov/)).toBeInTheDocument();
    expect(f.guardarAprobada).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Facturar la aprobada · $595.000" }),
    );
    await waitFor(() => expect(onEmitidos).toHaveBeenCalled());
    expect(f.emitirDte).toHaveBeenCalledWith("ev-501", GUARDADA.pedida);
  });

  it("una guardada que ya no está lista vuelve sin aprobar y dice qué le falta (§9.48)", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("LO DE BELIA"),
      vista: vista(true),
    });
    f.revisarDte.mockResolvedValue(vista(false));
    abrir([evento(501)], { aprobadas: [GUARDADA] });
    expect(await screen.findByText("GUARDADA SPA")).toBeInTheDocument();
    expect(screen.getByText("1 de 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Facturar las 0 aprobadas" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled();
  });

  it("«Corregir» una guardada no la borra; aprobarla de nuevo guarda lo corregido (§9.48, §9.61)", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("LO DE BELIA"),
      vista: vista(true),
    });
    f.revisarDte.mockResolvedValue(vista(true));
    abrir([evento(501)], { aprobadas: [GUARDADA] });
    await screen.findByText("GUARDADA SPA");
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    expect(f.quitarAprobada).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "corregir ev-501" }));
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(f.guardarAprobada).toHaveBeenCalledWith(
      "ev-501",
      null,
      expect.objectContaining({
        receptor: expect.objectContaining({ razon_social: "CORREGIDA SPA" }),
      }),
      "aprobada",
    );
  });

  // §9.61 (27-11, la línea 40 de la #407): «Corregir» y «Cancelar» dejan lo
  // guardado como estaba; «Listo» guarda lo corregido como armada.
  it("«Corregir» y «Cancelar» no tocan lo guardado; «Listo» deja lo corregido armado", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("GUARDADA SPA"),
      vista: vista(true),
    });
    f.revisarDte.mockResolvedValue(vista(true));
    abrir([evento(501)], {
      aprobadas: [
        {
          ...GUARDADA,
          estado: "armada" as const,
          aprobada_por_nombre: "BelIA",
        },
      ],
    });
    await screen.findByText(/BelIA · /);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Corregir" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(f.quitarAprobada).not.toHaveBeenCalled();
    expect(f.guardarAprobada).not.toHaveBeenCalled();
    expect(screen.getByText("Armada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    fireEvent.click(screen.getByRole("button", { name: "corregir ev-501" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(f.quitarAprobada).not.toHaveBeenCalled();
    expect(f.guardarAprobada).toHaveBeenCalledWith(
      "ev-501",
      null,
      expect.objectContaining({
        receptor: expect.objectContaining({ razon_social: "CORREGIDA SPA" }),
      }),
      "armada",
    );
  });

  // §9.60 (Felipe, 25-11: *"por que dice que yo la aprobe?"* y *"el dejar
  // armada es un proceso interno (…) nosotros corregimos, aprobamos,
  // facturamos"*): la armada la deja el sistema; la ventana no la arma, no
  // la factura y la aprueba a nombre de quien aprueba.
  it("la armada por el sistema no se factura hasta aprobarla, y no hay botón para armar", async () => {
    f.revisarDte.mockResolvedValue(vista(true));
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("GUARDADA SPA"),
      vista: vista(true),
    });
    abrir([evento(501)], {
      aprobadas: [
        {
          ...GUARDADA,
          estado: "armada" as const,
          aprobada_por_nombre: "BelIA",
        },
      ],
    });
    await screen.findByText(/BelIA · /);
    expect(screen.getByText("Armada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dejar armada/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Facturar las 0 aprobadas/ }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(f.guardarAprobada).toHaveBeenCalledWith(
      "ev-501",
      null,
      expect.anything(),
      "aprobada",
    );
    expect(
      await screen.findByRole("button", { name: /Facturar la aprobada/ }),
    ).toBeEnabled();
  });

  it("una guardada armada se abre armada, a nombre de quien la armó, y la ventana parte en ella", async () => {
    f.revisarDte.mockResolvedValue(vista(true));
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("GUARDADA SPA"),
      vista: vista(true),
    });
    abrir([evento(501)], {
      aprobadas: [
        {
          ...GUARDADA,
          estado: "armada" as const,
          aprobada_por_nombre: "BelIA",
        },
      ],
    });
    expect(await screen.findByText(/BelIA · /)).toBeInTheDocument();
    expect(screen.getByText("1 de 1")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled(),
    );
  });

  it("si la aprobación no se pudo guardar, lo dice y queda sin aprobar (§9.48)", async () => {
    r.revisarUnoParaLaMasiva.mockResolvedValue({
      tipo: 33,
      pedida: pedida("RAZON"),
      vista: vista(true),
    });
    f.guardarAprobada.mockRejectedValue(new Error("sin conexión"));
    abrir([evento(501)]);
    await screen.findByText("RAZON");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(await screen.findByText("1 de 1")).toBeInTheDocument();
  });
});
