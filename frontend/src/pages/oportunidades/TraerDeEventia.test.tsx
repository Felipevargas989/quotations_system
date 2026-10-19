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
import { toast } from "../../components/toast/Toast";
import * as postulacion from "../../services/postulacion.service";
import { resumenDelRespaldo, resumenDeTraer } from "./respaldos";
import TraerDeEventia from "./TraerDeEventia";

// «TRAER DE EVENTIA» (decisión 45, 19-10): las facturas y órdenes de compra
// de los eventos hechos pasan a «Mi empresa» como respaldos, sin repetir.

vi.mock("../../services/postulacion.service", () => ({
  traerRespaldosDeEventia: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const p = vi.mocked(postulacion);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (alTraer = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TraerDeEventia alTraer={alTraer} />
    </QueryClientProvider>,
  );

describe("Traer de Eventia", () => {
  it("dice cuántos trajo, recarga la carpeta y muestra los que no pudo y por qué", async () => {
    p.traerRespaldosDeEventia.mockResolvedValue({
      traidos: 3,
      ya_estaban: 2,
      sin_traer: [
        "Evento N° 374 (JOKER SERVICIOS SPA): «Cotización.pdf» no parece orden de compra ni factura.",
      ],
    });
    const alTraer = vi.fn();
    pintar(alTraer);
    fireEvent.click(screen.getByRole("button", { name: /Traer de Eventia/ }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Traje 3 respaldos de Eventia · 2 ya estaban.",
      ),
    );
    expect(alTraer).toHaveBeenCalled();
    expect(
      screen.getByText(/Evento N° 374 \(JOKER SERVICIOS SPA\)/),
    ).toBeInTheDocument();
  });

  it("sin nada nuevo no recarga", async () => {
    p.traerRespaldosDeEventia.mockResolvedValue({
      traidos: 0,
      ya_estaban: 1,
      sin_traer: [],
    });
    const alTraer = vi.fn();
    pintar(alTraer);
    fireEvent.click(screen.getByRole("button", { name: /Traer de Eventia/ }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "No había respaldos nuevos en Eventia · 1 ya estaba.",
      ),
    );
    expect(alTraer).not.toHaveBeenCalled();
  });

  it("el resumen en palabras, y en la carpeta se ve de qué evento vino", () => {
    expect(resumenDeTraer({ traidos: 1, ya_estaban: 0, sin_traer: [] })).toBe(
      "Traje 1 respaldo de Eventia.",
    );
    expect(
      resumenDelRespaldo({
        numero: "5040-126-TD26",
        mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
        contrato: null,
        anio: 2026,
        monto: 1_245_000,
        fuente: "mercado_publico",
        evento: 473,
      }),
    ).toBe(
      "N° 5040-126-TD26 · ILUSTRE MUNICIPALIDAD DE QUILLON · 2026 · $1.245.000 · de Eventia (evento N° 473)",
    );
  });
});
