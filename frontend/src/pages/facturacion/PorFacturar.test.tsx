// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PorFacturar from "./PorFacturar";

// «POR FACTURAR» (doc 19 §9.21): los eventos con algo por emitir, y
// «Facturar» abre ahí mismo el «Emitir DTE» del evento.

let eventos: unknown[] = [];
vi.mock("./consultas", () => ({
  LLAVE_POR_FACTURAR: ["facturacion", "por-facturar"],
  usePorFacturar: () => ({
    isPending: false,
    isError: false,
    data: { ambiente: "simulado", desde: "2026-08-08", eventos },
  }),
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
});

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PorFacturar puedeEmitir />
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

  it("el administrador marca varios y los factura juntos", () => {
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
});
