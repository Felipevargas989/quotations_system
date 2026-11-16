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
// se abre con quién y su sencillo, se anotan los ingresos y los retiros
// (§9.51) y se cierra a
// ciegas, sin ver lo esperado.

vi.mock("../../services/caja.service", () => ({
  getCaja: vi.fn(),
  abrirCaja: vi.fn(),
  anotarRetiro: vi.fn(),
  anotarIngreso: vi.fn(),
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
      <CajaDeRecepcion nombre="Ana" />
    </QueryClientProvider>,
  );

describe("la caja de recepción (§9.43)", () => {
  it("cerrada: se abre con el sencillo, a nombre del perfil de la sesión (no se escribe)", async () => {
    c.getCaja.mockResolvedValue({ abierta: null });
    c.abrirCaja.mockResolvedValue(ABIERTA);
    abrir();
    await screen.findByText("Abrir la caja de recepción");
    expect(screen.queryByLabelText("¿Quién abre?")).toBeNull();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: "Abrir caja" });
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sencillo inicial"), {
      target: { value: "20000" },
    });
    fireEvent.click(boton);
    await waitFor(() =>
      expect(c.abrirCaja).toHaveBeenCalledWith({ sencillo: 20000 }),
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
    fireEvent.click(screen.getByRole("button", { name: "− Anotar retiro" }));
    fireEvent.change(screen.getByLabelText("Monto"), {
      target: { value: "10000" },
    });
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Compra de hielo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar retiro" }));
    await waitFor(() =>
      expect(c.anotarRetiro).toHaveBeenCalledWith({
        monto: 10000,
        motivo: "Compra de hielo",
      }),
    );
    expect(c.anotarIngreso).not.toHaveBeenCalled();
  });

  // §9.51: «Movimientos del turno», los ingresos y los retiros por hora.
  const CON_INGRESO = {
    abierta: {
      ...ABIERTA.abierta,
      movimientos: [
        {
          id: 2,
          tipo: "ingreso" as const,
          monto: 30000,
          motivo: "Sencillo que mandó Felipe",
          creado_por_nombre: "Ana",
          creado_en: "2026-11-09T15:10:00Z",
        },
        {
          id: 1,
          tipo: "retiro" as const,
          monto: 50000,
          motivo: "Entregado a administración",
          creado_por_nombre: null,
          creado_en: "2026-11-09T17:30:00Z",
        },
      ],
    },
  };

  it("§9.51: los movimientos por hora, cada uno con su chip y el monto con signo", async () => {
    c.getCaja.mockResolvedValue(CON_INGRESO);
    abrir();
    await screen.findByText("Movimientos del turno");
    const filas = screen.getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Ingreso");
    expect(filas[0]).toHaveTextContent("Sencillo que mandó Felipe");
    expect(filas[0]).toHaveTextContent("+$30.000");
    expect(filas[1]).toHaveTextContent("Retiro");
    expect(filas[1]).toHaveTextContent("−$50.000");
    // Las dos acciones, siempre en el mismo lugar.
    expect(
      screen.getByRole("button", { name: "+ Anotar ingreso" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "− Anotar retiro" }),
    ).toBeInTheDocument();
    // Ciego: nada de lo esperado.
    expect(screen.queryByText(/Según Eventia|Debería haber|Cuadra/)).toBeNull();
  });

  it("§9.51: sin movimientos lo dice", async () => {
    c.getCaja.mockResolvedValue({
      abierta: { ...ABIERTA.abierta, movimientos: [], retiros: [] },
    });
    abrir();
    expect(await screen.findByText("Sin movimientos.")).toBeInTheDocument();
  });

  it("§9.51: se anota un ingreso con su monto y su motivo", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    c.anotarIngreso.mockResolvedValue(CON_INGRESO);
    abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: "+ Anotar ingreso" }),
    );
    const guardar = screen.getByRole("button", { name: "Guardar ingreso" });
    expect(guardar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Monto"), {
      target: { value: "30000" },
    });
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Sencillo que mandó Felipe" },
    });
    fireEvent.click(guardar);
    await waitFor(() =>
      expect(c.anotarIngreso).toHaveBeenCalledWith({
        monto: 30000,
        motivo: "Sencillo que mandó Felipe",
      }),
    );
    expect(c.anotarRetiro).not.toHaveBeenCalled();
    expect(await screen.findByText("+$30.000")).toBeInTheDocument();
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
    fireEvent.click(cerrar);
    expect(
      screen.getByText("¿Cerrar la caja? Después no se puede reabrir."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cerrar" }));
    await waitFor(() =>
      expect(c.cerrarCaja).toHaveBeenCalledWith({
        efectivo: 67500,
        debito: 135000,
        credito: 95000,
        transferencia: 0,
        comentario: null,
      }),
    );
    // §9.47: el check con quién cerró y la hora; el formulario para abrir
    // otra caja no aparece solo.
    expect(
      await screen.findByText("La caja fue cerrada correctamente"),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Cerró Ana · \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.queryByText("Abrir la caja de recepción")).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir una caja nueva" }),
    );
    expect(screen.getByText("Abrir la caja de recepción")).toBeInTheDocument();
    expect(screen.queryByText("La caja fue cerrada correctamente")).toBeNull();
  });

  it("§9.49: si se cuentan pulseras, el cierre las pide a ciegas y las manda", async () => {
    c.getCaja.mockResolvedValue({ ...ABIERTA, cuenta_pulseras: true });
    c.cerrarCaja.mockResolvedValue({ cerrada_en: "2026-11-17T23:00:00Z" });
    abrir();
    await screen.findByText("Cerrar caja: ¿cuánto tienes?");
    // Nunca cuántas debería tener.
    expect(screen.queryByText(/Deberían|Faltan|Calza|Entregadas/)).toBeNull();
    for (const campo of [
      "Efectivo contado (con el sencillo)",
      "Débito (resumen de la máquina)",
      "Crédito (resumen de la máquina)",
      "Transferencias (comprobantes)",
    ])
      fireEvent.change(screen.getByLabelText(campo), {
        target: { value: "0" },
      });
    const cerrar = screen.getByRole("button", { name: "Cerrar caja" });
    // Faltan las pulseras.
    expect(cerrar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Pulseras que te quedan"), {
      target: { value: "94" },
    });
    fireEvent.click(cerrar);
    fireEvent.click(screen.getByRole("button", { name: "Sí, cerrar" }));
    await waitFor(() =>
      expect(c.cerrarCaja).toHaveBeenCalledWith({
        efectivo: 0,
        debito: 0,
        credito: 0,
        transferencia: 0,
        comentario: null,
        pulseras: 94,
      }),
    );
  });

  it("§9.49: una empresa sin pulseras no ve el campo", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    abrir();
    await screen.findByText("Cerrar caja: ¿cuánto tienes?");
    expect(screen.queryByLabelText("Pulseras que te quedan")).toBeNull();
  });
});
