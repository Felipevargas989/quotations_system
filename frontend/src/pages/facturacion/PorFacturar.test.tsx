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
vi.mock("./consultas", () => ({
  LLAVE_POR_FACTURAR: ["facturacion", "por-facturar"],
  usePorFacturar: () => ({
    isPending: false,
    isError: false,
    data: {
      ambiente: "simulado",
      desde: "2026-08-08",
      eventos,
      facturados_fuera: fuera,
    },
  }),
}));
const marcarFacturadoFuera = vi.fn().mockResolvedValue({ ok: true });
const devolverAPorFacturar = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../../services/facturas.service", () => ({
  marcarFacturadoFuera: (id: string) => marcarFacturadoFuera(id),
  devolverAPorFacturar: (id: string) => devolverAPorFacturar(id),
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

  it("el PDF de una factura en Documentos se avisa bajo el cliente (§9.24)", () => {
    eventos = [{ ...EVENTO, tiene_factura_en_documentos: true }];
    abrir();
    expect(screen.getByText("Tiene factura en Documentos")).toBeInTheDocument();
    expect(screen.getByText("1 OC")).toBeInTheDocument();
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
