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
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as caja from "../../services/caja.service";
import CerrarLaCaja from "./CerrarLaCaja";

// «CERRAR CAJA» EN EL PANEL DE LA CAJA ABIERTA (doc 19 §9.55; Felipe, 16-11:
// «creo que mejoraría el cerrar caja… a nivel de front puede quedar
// mejor»). Una fila por medio con lo que se contó; quien revisa ve además
// lo que dice el sistema, la diferencia de cada fila, el total y la banda.
// Recepción, a ciegas.

vi.mock("../../services/caja.service", () => ({
  cerrarCaja: vi.fn(),
  getEsperadoDeLaCaja: vi.fn(),
}));
const c = vi.mocked(caja);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ESPERADO = {
  efectivo: 41850,
  debito: 8000,
  credito: 0,
  transferencia: 5000,
};

const abrir = (props: Partial<ComponentProps<typeof CerrarLaCaja>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CerrarLaCaja
        nombre="Camila"
        cuentaPulseras={false}
        onCerrada={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );

const escribir = (medio: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(medio), { target: { value: valor } });
const fila = (medio: string) =>
  screen.getByLabelText(medio).closest("tr") as HTMLElement;

describe("Cerrar caja (§9.55)", () => {
  it("el título y quién cierra, en línea chica (no una casilla)", () => {
    abrir();
    expect(
      screen.getByRole("heading", { name: "Cerrar caja" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cierra Camila")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Cierra/ })).toBeNull();
  });

  it("quien revisa: cada fila con su diferencia al escribir; vacío es «—», no cero", () => {
    abrir({ ciego: false, esperado: ESPERADO });
    const efectivo = fila("Efectivo");
    expect(efectivo).toHaveTextContent("$41.850");
    expect(within(efectivo).getByText("—")).toBeInTheDocument();
    escribir("Efectivo", "41850");
    expect(within(efectivo).getByText("Cuadra")).toHaveClass("text-green-700");
    escribir("Efectivo", "40000");
    expect(within(efectivo).getByText("Faltan $1.850")).toHaveClass(
      "text-red-700",
    );
    escribir("Débito", "9000");
    expect(within(fila("Débito")).getByText("Sobran $1.000")).toHaveClass(
      "text-red-700",
    );
    // Crédito y transferencias siguen vacías.
    expect(within(fila("Crédito")).getByText("—")).toBeInTheDocument();
  });

  it("quien revisa: el total en plata y la banda de la diferencia, recién con todo escrito", () => {
    abrir({ ciego: false, esperado: ESPERADO });
    const total = screen
      .getByText("Total en plata")
      .closest("tr") as HTMLElement;
    // Sistema: 41.850 + 8.000 + 0 + 5.000.
    expect(total).toHaveTextContent("$54.850");
    expect(screen.queryByRole("status")).toBeNull();
    escribir("Efectivo", "41850");
    escribir("Débito", "8000");
    escribir("Crédito", "0");
    expect(screen.queryByRole("status")).toBeNull();
    escribir("Transferencias", "5000");
    const banda = screen.getByRole("status");
    expect(banda).toHaveTextContent("DiferenciaCuadra");
    expect(banda).toHaveClass("text-green-700");
    expect(total).toHaveTextContent("$54.850$54.850");
    escribir("Transferencias", "2000");
    expect(screen.getByRole("status")).toHaveTextContent("Faltan $3.000");
    expect(screen.getByRole("status")).toHaveClass("text-red-700");
  });

  it("el aviso aparece solo al apretar con casillas vacías, y no cierra", () => {
    abrir({ ciego: false, esperado: ESPERADO });
    const aviso = "Anota los cuatro montos: si un medio no tuvo ventas, pon 0.";
    expect(screen.queryByText(aviso)).toBeNull();
    const boton = screen.getByRole("button", { name: "Cerrar caja" });
    expect(boton).not.toBeDisabled();
    fireEvent.click(boton);
    expect(screen.getByText(aviso)).toHaveClass("text-red-700");
    expect(screen.queryByText(/¿Cerrar la caja\?/)).toBeNull();
    expect(c.cerrarCaja).not.toHaveBeenCalled();
  });

  it("con todo escrito, pregunta y cierra", async () => {
    c.cerrarCaja.mockResolvedValue({ cerrada_en: "2026-11-16T23:00:00Z" });
    const onCerrada = vi.fn();
    abrir({ onCerrada });
    ["Efectivo", "Débito", "Crédito", "Transferencias"].forEach((m) =>
      escribir(m, "0"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cerrar" }));
    await waitFor(() =>
      expect(onCerrada).toHaveBeenCalledWith("2026-11-16T23:00:00Z"),
    );
  });

  it("las pulseras: sin el dato del sistema, «—» en su fila", () => {
    abrir({ ciego: false, esperado: ESPERADO, cuentaPulseras: true });
    const pulseras = fila("Pulseras");
    expect(pulseras).toHaveTextContent("las que te quedan");
    escribir("Pulseras", "94");
    expect(within(pulseras).getAllByText("—")).toHaveLength(2);
  });

  it("a ciegas (recepción): solo el medio y «Contaste»; nada del sistema", () => {
    abrir({ ciego: true, cuentaPulseras: true });
    expect(screen.getByText("Contaste")).toBeInTheDocument();
    expect(
      screen.queryByText(/Según sistema|Diferencia|Total en plata|Cuadra/),
    ).toBeNull();
    escribir("Efectivo", "26850");
    expect(screen.queryByText(/Faltan|Sobran|Cuadra/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Pulseras")).toBeInTheDocument();
    expect(c.getEsperadoDeLaCaja).not.toHaveBeenCalled();
  });
});
