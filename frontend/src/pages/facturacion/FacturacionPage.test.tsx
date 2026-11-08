// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FacturacionPage from "./FacturacionPage";

// LA SECCIÓN «FACTURACIÓN» (doc 19 §9.21, 06-11). Arriba «Nuevo documento»
// con lo que cada uno puede emitir; abajo el detalle. Ya no están «Boleta
// suelta», «Por boletear» ni «Emitidas hoy». Desde el 07-11 (§9.23) todo
// se factura acá: recepción, la boleta y la factura del tarifario;
// operaciones, además los eventos («Facturar eventos») y «Documentos».

let rol = "recepcion";
// Los permisos por cargo (doc 22 §7): sin lista propia, los de fábrica.
let permisos: string[] | null = null;
vi.mock("../../contexts/AuthContext", async () => {
  const { permisosDe } = await import("../../constants/permissions");
  return {
    useAuth: () => ({
      userRole: rol,
      permisos: permisosDe(rol as never, permisos),
    }),
  };
});
vi.mock("../boletas/consultas", () => ({
  LLAVE_HOY: ["boletas", "emitidas-hoy"],
  useEmitidasHoy: () => ({
    data: { ambiente: "simulado", fecha: "2026-11-06", boletas: [] },
  }),
}));
vi.mock("./ListaDeDocumentos", () => ({
  default: () => <p>lista de documentos</p>,
}));
vi.mock("../boletas/TarifarioDeBoletas", () => ({
  default: () => <p>el tarifario</p>,
}));
// Cada documento trae su cabecera: el título y «← Documentos».
vi.mock("./BoletaNueva", () => ({
  default: ({ onVolver }: { onVolver: () => void }) => (
    <div>
      <p>la boleta</p>
      <h1>Nueva boleta electrónica</h1>
      <button type="button" onClick={onVolver}>
        {" "}
        Documentos
      </button>
    </div>
  ),
}));
vi.mock("./consultas", () => ({
  usePorFacturar: (activa: boolean) => ({
    data: activa
      ? { ambiente: "simulado", desde: "2026-08-08", eventos: [{ id: "a" }] }
      : undefined,
  }),
}));
vi.mock("./PorFacturar", () => ({
  default: () => <p>los eventos por facturar</p>,
}));
vi.mock("./FacturaNueva", () => ({
  default: () => <p>la factura nueva</p>,
}));
vi.mock("./TraerFactura", () => ({
  default: () => <p>pantalla de traer factura</p>,
}));
vi.mock("./NotaNueva", () => ({
  default: ({ tipo }: { tipo: string }) => <p>la nota: {tipo}</p>,
}));

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FacturacionPage />
    </QueryClientProvider>,
  );

const pestanas = () =>
  screen
    .queryAllByRole("button")
    .map((b) => b.textContent)
    .filter(
      (t) =>
        t === "Documentos" ||
        t === "Tarifario" ||
        (t ?? "").startsWith("Por facturar"),
    );

afterEach(() => {
  cleanup();
  rol = "recepcion";
  permisos = null;
});

describe("la sección Facturación", () => {
  it("recepción: «Nuevo documento» ofrece la boleta y la factura del tarifario, sin pestañas", () => {
    abrir();
    expect(pestanas()).toEqual([]);
    expect(screen.queryByText("Boleta suelta")).not.toBeInTheDocument();
    expect(screen.queryByText(/Por boletear/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Emitidas hoy/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo DTE" }));
    expect(
      screen.getByRole("button", { name: "Factura electrónica" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nota de crédito" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Boleta electrónica" }));
    expect(screen.getByText("la boleta")).toBeInTheDocument();
    expect(
      screen.getByText(/Modo simulado: .*Los documentos/),
    ).toBeInTheDocument();
  });

  it("operaciones: «Documentos» y «Por facturar» abajo, y la boleta y la factura arriba", () => {
    rol = "operaciones";
    abrir();
    expect(pestanas()).toEqual(["Documentos", "Por facturar (1)"]);
    fireEvent.click(screen.getByRole("button", { name: "Por facturar (1)" }));
    expect(screen.getByText("los eventos por facturar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documentos" }));
    expect(screen.getByText("lista de documentos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo DTE" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Factura electrónica" }),
    );
    expect(screen.getByText("la factura nueva")).toBeInTheDocument();
  });

  it("el administrador: el tarifario se queda, y «Nuevo documento» pregunta en una ventana qué documento (§9.22)", () => {
    rol = "administrador";
    abrir();
    expect(pestanas()).toEqual(["Documentos", "Por facturar (1)", "Tarifario"]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo DTE" }));
    for (const t of [
      "Factura electrónica",
      "Boleta electrónica",
      "Nota de crédito",
      "Nota de débito",
    ])
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    expect(screen.queryByText("la boleta")).not.toBeInTheDocument();
    // El documento se arma en su propia pantalla, y «← Documentos» vuelve.
    fireEvent.click(screen.getByRole("button", { name: "Boleta electrónica" }));
    expect(screen.getByText("la boleta")).toBeInTheDocument();
    expect(screen.getByText("Nueva boleta electrónica")).toBeInTheDocument();
    expect(pestanas()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Documentos" }));
    expect(screen.getByText("lista de documentos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo DTE" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Factura electrónica" }),
    );
    expect(screen.getByText("la factura nueva")).toBeInTheDocument();
  });

  it("«Por facturar» va con «Facturar eventos», y «Documentos» con el suyo (§9.23)", () => {
    rol = "operaciones";
    permisos = ["facturacion_eventos"];
    abrir();
    expect(pestanas()).toEqual(["Por facturar (1)"]);
    // Sin «Boletas y facturas del tarifario», no emite de cero.
    expect(
      screen.queryByRole("button", { name: "Nuevo DTE" }),
    ).toBeNull();
    cleanup();
    permisos = ["facturacion_documentos"];
    abrir();
    expect(pestanas()).toEqual(["Documentos"]);
  });

  it("con los interruptores: Documentos a recepción, sin el tarifario al administrador", () => {
    permisos = ["boletas", "facturacion_documentos"];
    abrir();
    expect(pestanas()).toContain("Documentos");
    cleanup();
    rol = "administrador";
    permisos = ["boletas", "facturacion_documentos", "facturacion_notas"];
    abrir();
    expect(pestanas()).not.toContain("Tarifario");
  });
});
