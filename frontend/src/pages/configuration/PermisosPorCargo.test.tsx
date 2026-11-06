// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PantallaDePermisos,
  cambiarPermiso,
  cambiarTipo,
  getPermisos,
  volverAFabrica,
} from "../../services/permisos.service";
import PermisosPorCargo from "./PermisosPorCargo";
import { textoDelUltimoCambio } from "./ultimoCambio";

// LA PESTAÑA «PERMISOS POR CARGO» (doc 22): pinta lo que manda el motor,
// un interruptor por permiso y por cargo, y guarda de a uno.

vi.mock("../../services/permisos.service", () => ({
  getPermisos: vi.fn(),
  cambiarPermiso: vi.fn(),
  cambiarTipo: vi.fn(),
  volverAFabrica: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { error: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

const celdas = (r: boolean, v: boolean, o: boolean, a: boolean) => ({
  recepcion: { prendido: r, fabrica: r },
  vendedor: { prendido: v, fabrica: v },
  operaciones: { prendido: o, fabrica: o },
  administrador: { prendido: a, fabrica: a },
});

const pantalla = (
  cambios: Partial<PantallaDePermisos> = {},
): PantallaDePermisos => ({
  cargos: ["recepcion", "vendedor", "operaciones", "administrador"],
  permisos: [
    {
      clave: "cotizaciones",
      area: "comercial",
      nombre: "Cotizaciones",
      candado: null,
      celdas: celdas(true, true, true, true),
    },
    {
      clave: "postventa",
      area: "operacion",
      nombre: "Post-Venta",
      candado: "plan",
      celdas: celdas(false, false, false, false),
    },
    {
      clave: "usuarios",
      area: "administracion",
      nombre: "Gestión de usuarios y permisos",
      candado: "fijo",
      celdas: celdas(false, false, false, true),
    },
  ],
  deFabrica: true,
  ultimoCambio: null,
  ...cambios,
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PermisosPorCargo />
    </QueryClientProvider>,
  );

beforeEach(() => vi.mocked(getPermisos).mockResolvedValue(pantalla()));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PermisosPorCargo", () => {
  it("filas por área, columnas por cargo, cada celda un interruptor", async () => {
    pintar();
    expect(await screen.findByText("Comercial")).toBeInTheDocument();
    expect(screen.getByText("Operación")).toBeInTheDocument();
    expect(screen.getByText("Administración")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(12);
    expect(
      screen.getByRole("switch", { name: "Cotizaciones de Recepción" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("lo que el plan no trae y lo fijo del administrador vienen con candado", async () => {
    pintar();
    const plan = await screen.findByRole("switch", {
      name: "Post-Venta de Operaciones",
    });
    expect(plan).toBeDisabled();
    expect(plan.parentElement).toHaveAttribute(
      "title",
      "No está incluido en tu plan",
    );
    expect(
      screen.getByRole("switch", {
        name: "Gestión de usuarios y permisos de Administrador",
      }),
    ).toBeDisabled();
  });

  it("un toque guarda ese permiso de ese cargo y pinta lo que vuelve", async () => {
    const despues = pantalla({ deFabrica: false });
    despues.permisos[0].celdas.recepcion = { prendido: false, fabrica: true };
    vi.mocked(cambiarPermiso).mockResolvedValue(despues);
    pintar();
    const celda = await screen.findByRole("switch", {
      name: "Cotizaciones de Recepción",
    });
    await userEvent.click(celda);
    expect(cambiarPermiso).toHaveBeenCalledWith({
      cargo: "recepcion",
      permiso: "cotizaciones",
      prendido: false,
    });
    expect(
      await screen.findByRole("switch", { name: "Cotizaciones de Recepción" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("«Volver a lo de fábrica»: apagado si ya está de fábrica; si no, pregunta y vuelve", async () => {
    pintar();
    expect(
      await screen.findByRole("button", { name: "Volver a lo de fábrica" }),
    ).toBeDisabled();
    cleanup();

    vi.mocked(getPermisos).mockResolvedValue(pantalla({ deFabrica: false }));
    vi.mocked(volverAFabrica).mockResolvedValue(pantalla());
    pintar();
    await userEvent.click(
      await screen.findByRole("button", { name: "Volver a lo de fábrica" }),
    );
    expect(volverAFabrica).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, volver" }));
    expect(volverAFabrica).toHaveBeenCalledTimes(1);
  });

  it("abajo, el último cambio", async () => {
    vi.mocked(getPermisos).mockResolvedValue(
      pantalla({
        ultimoCambio: {
          quien: "Felipe",
          cuando: "2026-11-05T21:30:00Z",
          accion: "cambio",
          cargo: "recepcion",
          permiso: "cotizaciones",
          prendido: false,
        },
      }),
    );
    pintar();
    const pie = await screen.findByText(/^Último cambio: Felipe apagó/);
    expect(within(pie).getByText(/Cotizaciones a Recepción/)).toBeTruthy();
  });

  it("el texto del último cambio, también al volver a lo de fábrica", () => {
    const nombre = (c: string) => (c === "cotizaciones" ? "Cotizaciones" : c);
    expect(textoDelUltimoCambio(null, nombre)).toBe(
      "Último cambio: ninguno, todo está de fábrica.",
    );
    expect(
      textoDelUltimoCambio(
        {
          quien: "Camila",
          cuando: "2026-11-05T21:30:00Z",
          accion: "fabrica",
          cargo: null,
          permiso: null,
          prendido: null,
        },
        nombre,
      ),
    ).toMatch(/^Último cambio: Camila volvió todo a lo de fábrica, /);
  });

  // Doc 22 §9: el bloque «Tipos de cliente», sin candados.
  it("los tipos de cliente: un interruptor por tipo y por cargo, y guarda de a uno", async () => {
    const conTipos = pantalla({
      tipos: [
        {
          id: 2,
          nombre: "Particulares",
          celdas: celdas(true, true, true, true),
        },
        { id: 4, nombre: "Empresas", celdas: celdas(false, true, true, true) },
      ],
    });
    vi.mocked(getPermisos).mockResolvedValue(conTipos);
    const despues = pantalla({
      deFabrica: false,
      tipos: [
        conTipos.tipos![0],
        {
          id: 4,
          nombre: "Empresas",
          celdas: {
            ...celdas(false, true, true, true),
            vendedor: { prendido: false, fabrica: true },
          },
        },
      ],
    });
    vi.mocked(cambiarTipo).mockResolvedValue(despues);
    pintar();
    expect(await screen.findByText("Tipos de cliente")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(20);
    const empresasDeRecepcion = screen.getByRole("switch", {
      name: "Empresas de Recepción",
    });
    expect(empresasDeRecepcion).toHaveAttribute("aria-checked", "false");
    expect(empresasDeRecepcion).not.toBeDisabled();
    await userEvent.click(
      screen.getByRole("switch", { name: "Empresas de Vendedor" }),
    );
    expect(cambiarTipo).toHaveBeenCalledWith({
      cargo: "vendedor",
      tipo: 4,
      prendido: false,
    });
    expect(
      await screen.findByRole("switch", { name: "Empresas de Vendedor" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("el último cambio de un tipo dice su nombre", async () => {
    vi.mocked(getPermisos).mockResolvedValue(
      pantalla({
        tipos: [
          {
            id: 7,
            nombre: "Club Adulto Mayor",
            celdas: celdas(true, true, true, true),
          },
        ],
        ultimoCambio: {
          quien: "Felipe",
          cuando: "2026-11-05T21:30:00Z",
          accion: "cambio",
          cargo: "recepcion",
          permiso: "tipo_cliente:7",
          prendido: true,
        },
      }),
    );
    pintar();
    expect(
      await screen.findByText(
        /^Último cambio: Felipe prendió el tipo «Club Adulto Mayor» a Recepción/,
      ),
    ).toBeInTheDocument();
  });
});
