// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NominaDelSii from "./NominaDelSii";

// LA NÓMINA DEL SII (doc 19 §9.27): cuántas empresas tiene, cuándo se
// cargó y «Cargar de nuevo».

const getNominaSii = vi.fn();
const cargarNominaSii = vi.fn();
vi.mock("../../services/facturas.service", () => ({
  getNominaSii: () => getNominaSii(),
  cargarNominaSii: () => cargarNominaSii(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LISTA = {
  id: 1,
  empezo_en: "2026-11-08T04:00:00Z",
  termino_en: "2026-11-08T04:10:00Z",
  estado: "lista",
  empresas: 1709121,
  error: null,
  pedida_por_nombre: "Felipe",
};

describe("La nómina del SII", () => {
  it("dice cuántas empresas tiene y la vuelve a cargar", async () => {
    getNominaSii.mockResolvedValue({ ultima: LISTA, lista: LISTA });
    cargarNominaSii.mockResolvedValue({
      ...LISTA,
      id: 2,
      estado: "cargando",
      empresas: 0,
    });
    render(<NominaDelSii />);
    expect(
      await screen.findByText(/1\.709\.121 empresas · cargada el/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cargar de nuevo" }));
    expect(await screen.findByText(/cargando…/)).toBeInTheDocument();
    expect(cargarNominaSii).toHaveBeenCalledTimes(1);
  });

  it("sin cargar, lo dice; y si la última falló, el motivo", async () => {
    getNominaSii.mockResolvedValue({
      ultima: { ...LISTA, estado: "fallo", error: "el SII respondió 503" },
      lista: null,
    });
    render(<NominaDelSii />);
    expect(await screen.findByText("sin cargar")).toBeInTheDocument();
    expect(
      screen.getByText(/La última carga falló: el SII respondió 503/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cargar la nómina del SII" }),
    ).toBeInTheDocument();
  });
});
