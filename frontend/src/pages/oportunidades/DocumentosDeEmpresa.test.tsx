// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as postulacion from "../../services/postulacion.service";
import DocumentosDeEmpresa from "./DocumentosDeEmpresa";

// «NO USAR» (decisión 56, 20-10, en vez de «las 10 de siempre»). Felipe: "es
// más fácil la mantención... si solo marco lo que no quiero mostrar".

vi.mock("../../services/postulacion.service", () => ({
  marcarNoUsar: vi.fn(),
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

const respaldo = (id: number, numero: string, noUsar = false) => ({
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
    ...(noUsar ? { no_usar: true } : {}),
  },
  creado_en: "2026-10-19T22:00:00.000Z",
  quien: null,
});

describe("No usar", () => {
  it("marca un respaldo «No usar» y el marcado dice que no se usa", async () => {
    p.marcarNoUsar.mockResolvedValue({} as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentosDeEmpresa
          documentos={[respaldo(38, "312", true), respaldo(19, "5043-27-AG26")]}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/de mayor a menor monto/)).toBeInTheDocument();
    expect(screen.getByText("No se usa")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Volver a usar Orden de compra 312.pdf/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", {
        name: /No usar Orden de compra 5043-27-AG26.pdf/,
      }),
    );
    await waitFor(() => expect(p.marcarNoUsar).toHaveBeenCalledWith(19, true));
  });
});

// EL RESPALDO DE LA PATENTE (decisión 61, 20-10). Felipe: "acabo de subir
// el contrato de arriendo de patente, ¿puedes dejar por defecto que siempre
// me lo pase en el zip?".
describe("Respaldo de la patente", () => {
  it("es un tipo de la carpeta y avisa que va siempre junto a la patente", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentosDeEmpresa
          documentos={[
            {
              ...respaldo(42, "x"),
              tipo: "respaldo_patente",
              nombre: "Comodato de arriendo Valle del Sol.pdf",
              datos: null,
            },
          ]}
        />
      </QueryClientProvider>,
    );
    const etiqueta = "Respaldo de la patente (contrato, comodato o dictamen)";
    expect(screen.getByText(etiqueta)).toBeInTheDocument();
    expect(screen.queryByText(/junto a la patente/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Elige el tipo/ }));
    const lista = within(
      document.querySelector("[data-lista-scroll]") as HTMLElement,
    );
    fireEvent.click(lista.getByRole("button", { name: etiqueta }));
    expect(
      screen.getByText(
        "Va siempre en el ZIP para Mercado Público, junto a la patente.",
      ),
    ).toBeInTheDocument();
  });
});
