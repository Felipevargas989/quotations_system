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
import { afterEach, describe, expect, it, vi } from "vitest";
import PorFacturar from "./PorFacturar";

// «POR FACTURAR» (doc 19 §9.21): los eventos con algo por emitir, y
// «Facturar» abre ahí mismo el «Emitir DTE» del evento. Lo facturado fuera
// de Eventia (§9.24): «Ya está facturado», abajo plegado, y «Devolver».

let eventos: unknown[] = [];
let fuera: unknown[] = [];
let facturados: unknown[] = [];
vi.mock("./consultas", () => ({
  LLAVE_POR_FACTURAR: ["facturacion", "por-facturar"],
  usePorFacturar: () => ({
    isPending: false,
    isError: false,
    data: {
      ambiente: "simulado",
      desde: "2026-08-08",
      eventos,
      facturados,
      facturados_fuera: fuera,
    },
  }),
}));
const marcarFacturadoFuera = vi.fn().mockResolvedValue({ ok: true });
const devolverAPorFacturar = vi.fn().mockResolvedValue({ ok: true });
const leerOrdenesPendientes = vi
  .fn()
  .mockResolvedValue({ leidas: 0, sin_leer: [] });
vi.mock("../../services/facturas.service", () => ({
  marcarFacturadoFuera: (id: string) => marcarFacturadoFuera(id),
  devolverAPorFacturar: (id: string) => devolverAPorFacturar(id),
  leerOrdenesPendientes: () => leerOrdenesPendientes(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./FacturacionMasiva", () => ({
  default: ({ eventos }: { eventos: { numero: number }[] }) => (
    <p>facturar juntos: {eventos.map((e) => e.numero).join(", ")}</p>
  ),
}));
vi.mock("../postventa/facturacion/EmitirDte", () => ({
  default: ({ quotationId }: { quotationId: string }) => (
    <p>emitir el DTE de {quotationId}</p>
  ),
}));

afterEach(() => {
  cleanup();
  eventos = [];
  fuera = [];
  facturados = [];
  vi.clearAllMocks();
});

const EVENTO = {
  id: "ev-473",
  numero: 473,
  estado: "realizada",
  tipoDeEvento: "Seminario",
  fecha: "2026-08-10",
  cliente: "Municipalidad",
  total: 1245000,
  emitido: 0,
  queda: 1245000,
  ocs: 1,
};

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PorFacturar />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Por facturar", () => {
  it("cada evento con su total, lo emitido y lo que queda; «Facturar» abre su DTE", () => {
    eventos = [
      {
        id: "ev-501",
        numero: 501,
        estado: "aceptada",
        tipoDeEvento: "Paseo fin de año",
        fecha: "2026-12-06",
        cliente: "CCU",
        total: 1000000,
        emitido: 400000,
        queda: 600000,
        ocs: 1,
      },
    ];
    abrir();
    expect(screen.getByRole("link", { name: "#501" })).toHaveAttribute(
      "href",
      "/post-venta/ev-501",
    );
    expect(screen.getByText("$1.000.000")).toBeInTheDocument();
    expect(screen.getByText("$400.000")).toBeInTheDocument();
    expect(screen.getByText("$600.000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Facturar/ }));
    expect(screen.getByText("emitir el DTE de ev-501")).toBeInTheDocument();
  });

  it("quien factura eventos marca varios y los factura juntos", () => {
    eventos = [501, 502].map((numero) => ({
      id: `ev-${numero}`,
      numero,
      estado: "aceptada",
      tipoDeEvento: null,
      fecha: "2026-12-06",
      cliente: "CCU",
      total: 100000,
      emitido: 0,
      queda: 100000,
      ocs: 0,
    }));
    abrir();
    fireEvent.click(screen.getByRole("checkbox", { name: "Marcar todos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Facturar los 2 marcados" }),
    );
    expect(screen.getByText("facturar juntos: 501, 502")).toBeInTheDocument();
  });

  it("sin nada pendiente, lo dice desde cuándo mira", () => {
    abrir();
    expect(
      screen.getByText(/Todos los eventos desde el 08-08-2026 están emitidos/),
    ).toBeInTheDocument();
  });

  it("el PDF de una factura en Documentos se avisa bajo el cliente (§9.24), junto a sus OC", () => {
    eventos = [
      {
        ...EVENTO,
        tiene_factura_en_documentos: true,
        ordenes: [
          {
            id: 1,
            numero: "4500123",
            total: 1245000,
            facturado: 0,
            queda: 1245000,
            estado: "pendiente",
          },
        ],
      },
    ];
    abrir();
    expect(screen.getByText("Tiene factura en Documentos")).toBeInTheDocument();
    expect(screen.getByText("Con OC")).toBeInTheDocument();
    expect(screen.getByText(/OC 4500123 · \$1\.245\.000/)).toBeInTheDocument();
  });

  it("pendiente o parcial con el % facturado, cada OC con lo suyo y la que factura «Facturar» (§9.26)", () => {
    eventos = [
      {
        ...EVENTO,
        id: "ev-118",
        numero: 118,
        cliente: "CCU",
        total: 20000000,
        emitido: 10000000,
        queda: 10000000,
        ocs: 2,
        facturacion: "parcial",
        porcentaje_facturado: 50,
        ordenes: [
          {
            id: 1,
            numero: "4500001",
            total: 10000000,
            facturado: 10000000,
            queda: 0,
            estado: "facturado",
          },
          {
            id: 2,
            numero: "4500002",
            total: 10000000,
            facturado: 0,
            queda: 10000000,
            estado: "pendiente",
          },
        ],
        se_factura: { oc: "4500002", monto: 10000000 },
      },
      { ...EVENTO, facturacion: "pendiente" },
    ];
    abrir();
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByText("50 % facturado")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("facturada")).toBeInTheDocument();
    expect(screen.getByText("OC 4500002")).toBeInTheDocument();
  });

  it("la primera lectura: BelIA lee sola las OC sin leer y dice las que no pudo (§9.26)", async () => {
    eventos = [{ ...EVENTO, ocs_sin_leer: 2 }];
    leerOrdenesPendientes.mockResolvedValueOnce({
      leidas: 1,
      sin_leer: [
        {
          documento_id: 9,
          nombre: "oc.pdf",
          motivo: "no encontró el total",
          quotation_id: "ev-473",
          numero: 473,
        },
      ],
    });
    abrir();
    expect(
      screen.getByText(/BelIA está leyendo 2 órdenes de compra/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "BelIA no pudo leer «oc.pdf»: no encontró el total",
      ),
    ).toBeInTheDocument();
    expect(leerOrdenesPendientes).toHaveBeenCalledTimes(1);
  });

  it("sin OC por leer no le pide nada a BelIA", () => {
    eventos = [EVENTO];
    abrir();
    expect(leerOrdenesPendientes).not.toHaveBeenCalled();
  });

  it("los facturados completos en Eventia van abajo, plegados (§9.26)", () => {
    facturados = [
      { ...EVENTO, emitido: 1245000, queda: 0, facturacion: "facturado" },
    ];
    abrir();
    fireEvent.click(
      screen.getByRole("button", { name: /Facturados en Eventia \(1\)/ }),
    );
    expect(screen.getByText("Facturado")).toBeInTheDocument();
  });

  it("«Ya está facturado» pregunta antes y lo saca de la lista", async () => {
    eventos = [EVENTO];
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Ya está facturado" }));
    expect(
      screen.getByText("¿Ya se facturó fuera de Eventia?"),
    ).toBeInTheDocument();
    expect(marcarFacturadoFuera).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, sacarlo" }));
    await waitFor(() =>
      expect(marcarFacturadoFuera).toHaveBeenCalledWith("ev-473"),
    );
  });

  it("lo facturado fuera queda abajo, plegado, con quién lo marcó y «Devolver»", async () => {
    fuera = [
      {
        ...EVENTO,
        marcado_por: "Felipe",
        marcado_en: "2026-11-07T20:00:00Z",
      },
    ];
    abrir();
    // Sin pendientes, igual se ve lo facturado fuera.
    expect(screen.getByText(/están emitidos/)).toBeInTheDocument();
    const plegado = screen.getByRole("button", {
      name: /Facturados fuera de Eventia \(1\)/,
    });
    expect(screen.queryByText("Felipe · 7 nov.")).not.toBeInTheDocument();
    fireEvent.click(plegado);
    expect(screen.getByText("Felipe · 7 nov.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));
    await waitFor(() =>
      expect(devolverAPorFacturar).toHaveBeenCalledWith("ev-473"),
    );
  });
});
