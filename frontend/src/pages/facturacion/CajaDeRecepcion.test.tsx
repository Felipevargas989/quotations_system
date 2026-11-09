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
import * as caja from "../../services/caja.service";
import CajaDeRecepcion from "./CajaDeRecepcion";

// LA CAJA DE RECEPCIÓN, DEL LADO DE QUIEN LA OPERA (doc 19 §9.43, sprint 2):
// se abre con quién y su sencillo, se anotan los retiros y se cierra a
// ciegas, sin ver lo esperado.

vi.mock("../../services/caja.service", () => ({
  getCaja: vi.fn(),
  abrirCaja: vi.fn(),
  anotarRetiro: vi.fn(),
  cerrarCaja: vi.fn(),
  getCierres: vi.fn(),
  getCierre: vi.fn(),
  corregirMedio: vi.fn(),
  revisarCierre: vi.fn(),
}));
const c = vi.mocked(caja);

const ABIERTA = {
  abierta: {
    id: 7,
    abierta_por_nombre: "Ana",
    abierta_en: "2026-11-09T12:02:00Z",
    sencillo_inicial: 20000,
    retiros: [
      {
        id: 1,
        monto: 50000,
        motivo: "Entregado a administración",
        creado_en: "2026-11-09T17:30:00Z",
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CajaDeRecepcion />
    </QueryClientProvider>,
  );

describe("la caja de recepción (§9.43)", () => {
  it("cerrada: se abre con quién y el sencillo inicial", async () => {
    c.getCaja.mockResolvedValue({ abierta: null });
    c.abrirCaja.mockResolvedValue(ABIERTA);
    abrir();
    await screen.findByText("Abrir la caja de recepción");
    const boton = screen.getByRole("button", { name: "Abrir caja" });
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("¿Quién abre?"), {
      target: { value: "Ana" },
    });
    fireEvent.change(screen.getByLabelText("Sencillo inicial"), {
      target: { value: "20000" },
    });
    fireEvent.click(boton);
    await waitFor(() =>
      expect(c.abrirCaja).toHaveBeenCalledWith({
        quien: "Ana",
        sencillo: 20000,
      }),
    );
    expect(await screen.findByText(/abrió Ana/)).toBeInTheDocument();
  });

  it("abierta: los retiros del turno y uno nuevo con su motivo", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    c.anotarRetiro.mockResolvedValue(ABIERTA);
    abrir();
    expect(
      await screen.findByText(/Entregado a administración/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Anotar retiro" }));
    fireEvent.change(screen.getByLabelText("Monto"), {
      target: { value: "10000" },
    });
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Compra de hielo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(c.anotarRetiro).toHaveBeenCalledWith({
        monto: 10000,
        motivo: "Compra de hielo",
      }),
    );
  });

  it("el cierre ciego: los cuatro montos sin ver lo esperado, y no se reabre", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    c.cerrarCaja.mockResolvedValue({ cerrada_en: "2026-11-09T21:05:00Z" });
    abrir();
    await screen.findByText("Cerrar caja: ¿cuánto tienes?");
    // Nada de lo esperado ni de la diferencia.
    expect(screen.queryByText(/Según Eventia|Debería haber|Cuadra/)).toBeNull();
    const cerrar = screen.getByRole("button", { name: "Cerrar caja" });
    expect(cerrar).toBeDisabled();
    const montos: [string, string][] = [
      ["Efectivo contado (con el sencillo)", "67500"],
      ["Débito (resumen de la máquina)", "135000"],
      ["Crédito (resumen de la máquina)", "95000"],
      ["Transferencias (comprobantes)", "0"],
    ];
    for (const [campo, valor] of montos)
      fireEvent.change(screen.getByLabelText(campo), {
        target: { value: valor },
      });
    fireEvent.change(screen.getByLabelText("Quién cierra"), {
      target: { value: "Ana" },
    });
    fireEvent.click(cerrar);
    expect(
      screen.getByText("¿Cerrar la caja? Después no se puede reabrir."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cerrar" }));
    await waitFor(() =>
      expect(c.cerrarCaja).toHaveBeenCalledWith({
        quien: "Ana",
        efectivo: 67500,
        debito: 135000,
        credito: 95000,
        transferencia: 0,
        comentario: null,
      }),
    );
    expect(await screen.findByText(/Caja cerrada a las/)).toBeInTheDocument();
    expect(screen.getByText("Abrir la caja de recepción")).toBeInTheDocument();
  });
});
