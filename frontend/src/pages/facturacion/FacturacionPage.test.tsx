// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FacturacionPage from "./FacturacionPage";

// LA SECCIÓN «FACTURACIÓN» (doc 19 §9.21, 06-11). Arriba «Nuevo documento»
// con lo que cada uno puede emitir; abajo el detalle. Ya no están «Boleta
// suelta», «Por boletear» ni «Emitidas hoy».

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
vi.mock("./DocumentosDelMes", () => ({
  default: () => <p>lista de documentos</p>,
}));
vi.mock("../boletas/TarifarioDeBoletas", () => ({
  default: () => <p>el tarifario</p>,
}));
vi.mock("../boletas/BoletaSuelta", () => ({
  default: () => <p>la boleta</p>,
}));
vi.mock("./ElegirDocumento", () => ({
  default: ({ tipo }: { tipo: string }) => <p>elegir el documento: {tipo}</p>,
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
    .filter((t) => t === "Documentos" || t === "Tarifario");

afterEach(() => {
  cleanup();
  rol = "recepcion";
  permisos = null;
});

describe("la sección Facturación", () => {
  it("recepción: «Nuevo documento» la lleva directo a la boleta, sin pestañas", () => {
    abrir();
    expect(pestanas()).toEqual([]);
    expect(screen.queryByText("Boleta suelta")).not.toBeInTheDocument();
    expect(screen.queryByText(/Por boletear/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Emitidas hoy/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo documento" }));
    expect(screen.getByText("la boleta")).toBeInTheDocument();
    expect(
      screen.getByText(/Modo simulado: .*Los documentos/),
    ).toBeInTheDocument();
  });

  it("operaciones: «Documentos» abajo, y la boleta arriba", () => {
    rol = "operaciones";
    abrir();
    expect(pestanas()).toEqual(["Documentos"]);
    expect(screen.getByText("lista de documentos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo documento" }));
    expect(screen.getByText("la boleta")).toBeInTheDocument();
  });

  it("el administrador: el tarifario se queda, y «Nuevo documento» pregunta qué documento", () => {
    rol = "administrador";
    abrir();
    expect(pestanas()).toEqual(["Documentos", "Tarifario"]);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo documento" }));
    for (const t of ["Boleta", "Nota de crédito", "Nota de débito"])
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    expect(screen.queryByText("la boleta")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Boleta" }));
    expect(screen.getByText("la boleta")).toBeInTheDocument();
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
