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
import * as pulserasService from "../../services/pulseras.service";
import CajaDeRecepcion from "./CajaDeRecepcion";

// LA PESTAÑA CAJA (doc 19 §9.43; desde el §9.55, la caja abierta es una fila
// y se opera en su panel): se abre con el sencillo a nombre del perfil, al
// pinchar la fila «Abierta» se ven los movimientos y el cierre ciego;
// anotar movimientos y ver lo que dice el sistema dependen de su permiso.

vi.mock("../../services/caja.service", () => ({
  getCaja: vi.fn(),
  abrirCaja: vi.fn(),
  anotarRetiro: vi.fn(),
  anotarIngreso: vi.fn(),
  cerrarCaja: vi.fn(),
  getEsperadoDeLaCaja: vi.fn(),
  getCierres: vi.fn(),
  getResumenDeCierres: vi.fn(),
  getCierre: vi.fn(),
  corregirMedio: vi.fn(),
  revisarCierre: vi.fn(),
}));
vi.mock("../../services/pulseras.service", () => ({
  getPulseras: vi.fn(),
}));
const c = vi.mocked(caja);
const p = vi.mocked(pulserasService);

const ABIERTA = {
  abierta: {
    id: 7,
    abierta_por_nombre: "Ana",
    abierta_en: "2026-11-09T12:02:00Z",
    sencillo_inicial: 20000,
    movimientos: [
      {
        id: 2,
        tipo: "ingreso" as const,
        monto: 30000,
        motivo: "Sencillo que mandó Felipe",
        creado_por_nombre: "Camila",
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

const abrir = (props: Partial<ComponentProps<typeof CajaDeRecepcion>> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CajaDeRecepcion nombre="Ana" {...props} />
    </QueryClientProvider>,
  );

/** Pincha la fila de la caja abierta y devuelve su panel. */
const abrirElPanel = async () => {
  fireEvent.click((await screen.findByText("Abierta")).closest("tr")!);
  return screen.findByRole("dialog");
};

const MEDIOS = ["Efectivo", "Débito", "Crédito", "Transferencias"];

describe("la pestaña Caja (§9.43 y §9.55)", () => {
  it("cerrada: arriba solo «Abrir caja» con el sencillo, a nombre del perfil (no se escribe); abierta, es una fila", async () => {
    c.getCaja.mockResolvedValue({ abierta: null });
    c.abrirCaja.mockResolvedValue(ABIERTA);
    abrir();
    const boton = await screen.findByRole("button", { name: "Abrir caja" });
    expect(screen.queryByLabelText("¿Quién abre?")).toBeNull();
    expect(screen.getByText("Abre Ana")).toBeInTheDocument();
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sencillo inicial"), {
      target: { value: "20000" },
    });
    fireEvent.click(boton);
    await waitFor(() =>
      expect(c.abrirCaja).toHaveBeenCalledWith({ sencillo: 20000 }),
    );
    // La caja abierta, como primera fila: con cuánto abrió y «Abierta».
    const fila = (await screen.findByText("Abierta")).closest(
      "tr",
    ) as HTMLElement;
    expect(fila).toHaveTextContent("$20.000");
    expect(screen.queryByRole("button", { name: "Abrir caja" })).toBeNull();
    // Sin el bloque grande de antes.
    expect(screen.queryByRole("heading", { name: "Cerrar caja" })).toBeNull();
  });

  it("recepción: solo la fila de la caja abierta, sin nada de lo que dice el sistema", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    abrir();
    await screen.findByText("Abierta");
    expect(screen.queryByText("Debía tener")).toBeNull();
    expect(screen.queryByText("Cerró con")).toBeNull();
    expect(
      screen.queryByText(/Efectivo que falta|Turnos por revisar/),
    ).toBeNull();
    expect(c.getCierres).not.toHaveBeenCalled();
    expect(c.getResumenDeCierres).not.toHaveBeenCalled();
  });

  it("recepción: el panel con quién abrió, los movimientos (sin «Anotar movimiento») y el cierre ciego", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    abrir();
    const panel = await abrirElPanel();
    expect(within(panel).getByText(/Abrió/)).toHaveTextContent(
      /Abrió Ana a las .+ con \$20\.000/,
    );
    const filas = within(panel).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Ingreso");
    expect(filas[0]).toHaveTextContent("+$30.000");
    expect(filas[1]).toHaveTextContent("Retiro");
    expect(filas[1]).toHaveTextContent("−$50.000");
    expect(
      within(panel).queryByRole("button", { name: "Anotar movimiento" }),
    ).toBeNull();
    expect(
      within(panel).getByRole("heading", { name: "Cerrar caja" }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Cierra Ana")).toBeInTheDocument();
    // Ciego: nada de lo esperado, y ni siquiera se pide.
    expect(
      within(panel).queryByText(
        /Según sistema|Diferencia|Total en plata|Debía|Cuadra/,
      ),
    ).toBeNull();
    expect(c.getEsperadoDeLaCaja).not.toHaveBeenCalled();
  });

  it("el cierre ciego: los cuatro montos, se confirma y queda el check; no se reabre", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    c.cerrarCaja.mockResolvedValue({ cerrada_en: "2026-11-09T21:05:00Z" });
    abrir();
    const panel = await abrirElPanel();
    const cerrar = within(panel).getByRole("button", { name: "Cerrar caja" });
    const montos = ["67500", "135000", "95000", "0"];
    MEDIOS.forEach((campo, i) =>
      fireEvent.change(within(panel).getByLabelText(campo), {
        target: { value: montos[i] },
      }),
    );
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
    // §9.47: el check con quién cerró y la hora; el panel se va y el
    // formulario para abrir otra caja no aparece solo.
    expect(
      await screen.findByText("La caja fue cerrada correctamente"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/^Cerró Ana · \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir caja" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir una caja nueva" }),
    );
    expect(
      screen.getByRole("button", { name: "Abrir caja" }),
    ).toBeInTheDocument();
  });

  it("§9.49: si se cuentan pulseras, el cierre las pide a ciegas y las manda", async () => {
    c.getCaja.mockResolvedValue({ ...ABIERTA, cuenta_pulseras: true });
    c.cerrarCaja.mockResolvedValue({ cerrada_en: "2026-11-17T23:00:00Z" });
    abrir();
    const panel = await abrirElPanel();
    // Nunca cuántas debería tener.
    expect(
      within(panel).queryByText(/Deberían|Faltan|Calza|Entregadas/),
    ).toBeNull();
    for (const campo of MEDIOS)
      fireEvent.change(within(panel).getByLabelText(campo), {
        target: { value: "0" },
      });
    const cerrar = within(panel).getByRole("button", { name: "Cerrar caja" });
    // Faltan las pulseras: el aviso, recién al apretar.
    fireEvent.click(cerrar);
    expect(
      within(panel).getByText(
        "Anota los cuatro montos y las pulseras: si no hay, pon 0.",
      ),
    ).toBeInTheDocument();
    expect(c.cerrarCaja).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText("Pulseras"), {
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
    const panel = await abrirElPanel();
    expect(within(panel).queryByLabelText("Pulseras")).toBeNull();
  });

  it("§9.55: con «Anotar movimientos» (operaciones), un solo botón: se elige retiro, monto y motivo; sin el cierre", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    c.anotarRetiro.mockResolvedValue(ABIERTA);
    abrir({ puedeAbrirYCerrar: false, puedeAnotar: true });
    const panel = await abrirElPanel();
    expect(
      within(panel).queryByRole("heading", { name: "Cerrar caja" }),
    ).toBeNull();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Anotar movimiento" }),
    );
    // Sin elegir el tipo no se guarda.
    expect(
      within(panel).getByRole("button", { name: "Guardar" }),
    ).toBeDisabled();
    fireEvent.click(within(panel).getByRole("button", { name: "Retiro" }));
    fireEvent.change(within(panel).getByLabelText("Monto"), {
      target: { value: "10000" },
    });
    fireEvent.change(within(panel).getByLabelText("Motivo"), {
      target: { value: "Compra de hielo" },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Guardar retiro" }),
    );
    await waitFor(() =>
      expect(c.anotarRetiro).toHaveBeenCalledWith({
        monto: 10000,
        motivo: "Compra de hielo",
      }),
    );
    expect(c.anotarIngreso).not.toHaveBeenCalled();
    // Operaciones no ve sin abrir: sin «Abrir caja» ni lo esperado.
    expect(screen.queryByRole("button", { name: "Abrir caja" })).toBeNull();
    expect(c.getEsperadoDeLaCaja).not.toHaveBeenCalled();
  });

  it("§9.55: un ingreso con el mismo botón", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    c.anotarIngreso.mockResolvedValue(ABIERTA);
    abrir({ puedeAnotar: true });
    const panel = await abrirElPanel();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Anotar movimiento" }),
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Ingreso" }));
    fireEvent.change(within(panel).getByLabelText("Monto"), {
      target: { value: "30000" },
    });
    fireEvent.change(within(panel).getByLabelText("Motivo"), {
      target: { value: "Sencillo que mandó Felipe" },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Guardar ingreso" }),
    );
    await waitFor(() =>
      expect(c.anotarIngreso).toHaveBeenCalledWith({
        monto: 30000,
        motivo: "Sencillo que mandó Felipe",
      }),
    );
  });

  it("§9.55: quien revisa ve la cadena entera; la fila «Abierta» abre el panel con lo que dice el sistema al lado de cada casilla", async () => {
    c.getCaja.mockResolvedValue(ABIERTA);
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-02T00:00:00.000Z",
      efectivo_que_falta: 0,
      perdido_entre_turnos: 0,
      por_revisar: 0,
    });
    c.getCierres.mockResolvedValue([
      {
        id: 7,
        abierta_por_nombre: "Ana",
        abierta_en: "2026-11-09T12:02:00Z",
        sencillo_inicial: 20000,
        cerrada_por_nombre: null,
        cerrada_en: null,
        revisado_por_nombre: null,
        revisado_en: null,
        estado: "abierta",
        vendido: 0,
        declarado: null,
        diferencia: null,
        diferencias: [],
        apertura: null,
        debia_tener: null,
        cerro_con: null,
        diferencia_efectivo: null,
        diferencia_otros: null,
      },
    ]);
    c.getEsperadoDeLaCaja.mockResolvedValue({
      abierta: {
        id: 7,
        sencillo_inicial: 20000,
        ingresos: 30000,
        retiros: 50000,
        lineas: [
          { medio: "efectivo", vendido: 15000, esperado: 15000 },
          { medio: "debito", vendido: 8000, esperado: 8000 },
          { medio: "credito", vendido: 0, esperado: 0 },
          { medio: "transferencia", vendido: 0, esperado: 0 },
        ],
      },
    });
    abrir({ puedeRevisar: true, puedeAnotar: true });
    expect(await screen.findByText("Debía tener")).toBeInTheDocument();
    const panel = await abrirElPanel();
    // El panel de la caja abierta, no el detalle de un cierre.
    expect(within(panel).getByText("Caja abierta")).toBeInTheDocument();
    expect(within(panel).getByText("Según sistema")).toBeInTheDocument();
    const efectivo = within(panel)
      .getByLabelText(MEDIOS[0])
      .closest("tr") as HTMLElement;
    await waitFor(() => expect(efectivo).toHaveTextContent("$15.000"));
    expect(
      within(panel).getByRole("button", { name: "Anotar movimiento" }),
    ).toBeInTheDocument();
  });
  it("quien revisa y ve Pulseras: el cierre muestra cuántas deberían quedar y la diferencia (Felipe, 17-11)", async () => {
    c.getCaja.mockResolvedValue({ ...ABIERTA, cuenta_pulseras: true });
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-02T00:00:00.000Z",
      efectivo_que_falta: 0,
      perdido_entre_turnos: 0,
      por_revisar: 0,
    });
    c.getCierres.mockResolvedValue([
      {
        id: 7,
        abierta_por_nombre: "Ana",
        abierta_en: "2026-11-09T12:02:00Z",
        sencillo_inicial: 20000,
        cerrada_por_nombre: null,
        cerrada_en: null,
        revisado_por_nombre: null,
        revisado_en: null,
        estado: "abierta",
        vendido: 0,
        declarado: null,
        diferencia: null,
        diferencias: [],
        apertura: null,
        debia_tener: null,
        cerro_con: null,
        diferencia_efectivo: null,
        diferencia_otros: null,
      },
    ]);
    c.getEsperadoDeLaCaja.mockResolvedValue({ abierta: null });
    p.getPulseras.mockResolvedValue({
      deberian_quedar: 94,
    } as Awaited<ReturnType<typeof pulserasService.getPulseras>>);
    abrir({ puedeRevisar: true, puedeVerPulseras: true });
    const panel = await abrirElPanel();
    const fila = within(panel)
      .getByLabelText("Pulseras")
      .closest("tr") as HTMLElement;
    await waitFor(() => expect(fila).toHaveTextContent("94"));
    fireEvent.change(within(panel).getByLabelText("Pulseras"), {
      target: { value: "92" },
    });
    await waitFor(() => expect(fila).toHaveTextContent("Faltan 2"));
  });

  it("sin el permiso de Pulseras, el dato ni se pide", async () => {
    c.getCaja.mockResolvedValue({ ...ABIERTA, cuenta_pulseras: true });
    c.getResumenDeCierres.mockResolvedValue({
      desde: "2026-11-02T00:00:00.000Z",
      efectivo_que_falta: 0,
      perdido_entre_turnos: 0,
      por_revisar: 0,
    });
    c.getCierres.mockResolvedValue([
      {
        id: 7,
        abierta_por_nombre: "Ana",
        abierta_en: "2026-11-09T12:02:00Z",
        sencillo_inicial: 20000,
        cerrada_por_nombre: null,
        cerrada_en: null,
        revisado_por_nombre: null,
        revisado_en: null,
        estado: "abierta",
        vendido: 0,
        declarado: null,
        diferencia: null,
        diferencias: [],
        apertura: null,
        debia_tener: null,
        cerro_con: null,
        diferencia_efectivo: null,
        diferencia_otros: null,
      },
    ]);
    c.getEsperadoDeLaCaja.mockResolvedValue({ abierta: null });
    abrir({ puedeRevisar: true });
    await abrirElPanel();
    expect(p.getPulseras).not.toHaveBeenCalled();
  });
});
