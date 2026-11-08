// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FacturasAnteriores from "./FacturasAnteriores";

// TUS FACTURAS ANTERIORES (doc 19 §9.29): cuántos clientes salieron de
// cuántas facturas, «Leer mis facturas anteriores» y, sin la conexión de
// verdad, el porqué y sin botón.

const getFacturasAnteriores = vi.fn();
const leerFacturasAnteriores = vi.fn();
vi.mock("../../services/facturas.service", () => ({
  getFacturasAnteriores: () => getFacturasAnteriores(),
  leerFacturasAnteriores: () => leerFacturasAnteriores(),
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
  empezo_en: "2026-11-08T08:00:00Z",
  termino_en: "2026-11-08T08:30:00Z",
  estado: "lista",
  folios: 380,
  desde_folio: 1,
  hasta_folio: 380,
  leidas: 380,
  encontradas: 212,
  clientes: 140,
  error: null,
  pedida_por_nombre: "Felipe",
};

describe("Tus facturas anteriores", () => {
  it("sin leer: lo dice, y al apretar el botón empieza a leer", async () => {
    getFacturasAnteriores.mockResolvedValue({
      ultima: null,
      clientes: 0,
      se_puede_leer: true,
      sin_conexion: null,
    });
    leerFacturasAnteriores.mockResolvedValue({
      ...LISTA,
      estado: "leyendo",
      leidas: 0,
      encontradas: 0,
      clientes: 0,
      termino_en: null,
    });
    render(<FacturasAnteriores />);
    expect(await screen.findByText("sin leer")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Leer mis facturas anteriores" }),
    );
    expect(await screen.findByText(/leyendo… 0 de 380/)).toBeInTheDocument();
    expect(leerFacturasAnteriores).toHaveBeenCalledTimes(1);
  });

  it("leídas: cuántos clientes de cuántas facturas, y «Leer de nuevo»", async () => {
    getFacturasAnteriores.mockResolvedValue({
      ultima: LISTA,
      clientes: 140,
      se_puede_leer: true,
      sin_conexion: null,
    });
    render(<FacturasAnteriores />);
    expect(
      await screen.findByText(/140 clientes de 212 facturas · leídas el/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Leer de nuevo" }),
    ).toBeInTheDocument();
  });

  it("sin la conexión de verdad, el porqué y sin botón; y si se cortó, el motivo", async () => {
    getFacturasAnteriores.mockResolvedValue({
      ultima: {
        ...LISTA,
        estado: "fallo",
        error: "facturacion.cl no responde",
      },
      clientes: 0,
      se_puede_leer: false,
      sin_conexion:
        "Con facturacion.cl simulado no hay facturas anteriores que leer",
    });
    render(<FacturasAnteriores />);
    expect(
      await screen.findByText(
        /La última lectura se cortó: facturacion.cl no responde/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Con facturacion.cl simulado no hay facturas anteriores/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
