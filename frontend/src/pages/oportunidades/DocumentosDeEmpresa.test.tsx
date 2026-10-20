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
import * as postulacion from "../../services/postulacion.service";
import DocumentosDeEmpresa from "./DocumentosDeEmpresa";

// «LAS 10 DE SIEMPRE» (decisión 53, 19-10). Felipe: "dejemos las mejores 10
// entre Eventia y Mercado Público y las usamos siempre".

vi.mock("../../services/postulacion.service", () => ({
  marcarDeSiempre: vi.fn(),
  leerRespaldo: vi.fn(),
  leerOrdenDeCompra: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  borrarDocumentoDeEmpresa: vi.fn(),
  subirDocumentoDeEmpresa: vi.fn(),
}));
vi.mock("../../components/FileViewLink", () => ({ default: () => null }));
vi.mock("./RespaldosEnLote", () => ({ default: () => null }));
vi.mock("./descargas", () => ({ descargarDelBalde: vi.fn() }));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const p = vi.mocked(postulacion);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const respaldo = (id: number, numero: string, siempre = false) => ({
  id,
  tipo: "respaldo_experiencia",
  nombre: `Orden de compra ${numero}.pdf`,
  ruta: `c1/oferente/documentos/x_${id}.pdf`,
  tipo_archivo: "application/pdf",
  bytes: 1000,
  vence: null,
  datos: {
    numero,
    mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
    contrato: null,
    anio: 2026,
    monto: 1_500_000,
    fuente: "mercado_publico" as const,
    ...(siempre ? { siempre: true } : {}),
  },
  creado_en: "2026-10-19T22:00:00.000Z",
  quien: null,
});

describe("Las 10 de siempre", () => {
  it("cuenta las marcadas y marca otra con la estrella", async () => {
    p.marcarDeSiempre.mockResolvedValue({} as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentosDeEmpresa
          documentos={[
            respaldo(21, "1213301-49-AG26", true),
            respaldo(19, "5043-27-AG26"),
          ]}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("1 de 10")).toBeInTheDocument();
    const marcada = screen.getByRole("button", {
      name: /Sacar Orden de compra 1213301-49-AG26.pdf de las 10/,
    });
    expect(marcada).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Marcar Orden de compra 5043-27-AG26.pdf entre las 10/,
      }),
    );
    await waitFor(() =>
      expect(p.marcarDeSiempre).toHaveBeenCalledWith(19, true),
    );
  });
});
