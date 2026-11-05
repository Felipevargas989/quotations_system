// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marcaDelAmbiente } from "../../constants/facturacion";
import * as documentos from "../../services/documentosTributarios.service";
import LetreroDelAmbiente from "./LetreroDelAmbiente";
import ProbarLaConexion from "./ProbarLaConexion";

// DÓNDE SE EMITE (doc 19 §9.18, paso 5): el letrero dice simulado, prueba o
// por qué no se puede emitir, y «Probar la conexión» muestra lo que midió
// el motor sin emitir nada.

vi.mock("../../services/documentosTributarios.service", () => ({
  probarConexionConFacturacionCl: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { error: vi.fn() },
}));
const d = vi.mocked(documentos);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("el letrero de dónde se emite", () => {
  it("simulado, prueba y sin conexión; conectado en producción, nada", () => {
    const { rerender, container } = render(
      <LetreroDelAmbiente ambiente="simulado" que="Las facturas" />,
    );
    expect(screen.getByText(/Modo simulado/)).toBeInTheDocument();

    rerender(<LetreroDelAmbiente ambiente="prueba" que="Las facturas" />);
    expect(
      screen.getByText(
        /Modo prueba: las facturas salen en el ambiente de pruebas/,
      ),
    ).toBeInTheDocument();

    rerender(
      <LetreroDelAmbiente
        ambiente="produccion"
        sinConexion="facturacion.cl todavía no está conectado"
        que="Las facturas"
      />,
    );
    expect(
      screen.getByText(
        "No se puede emitir: facturacion.cl todavía no está conectado.",
      ),
    ).toBeInTheDocument();

    rerender(<LetreroDelAmbiente ambiente="produccion" que="Las facturas" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lo que no vale ante el SII lo dice en su nombre", () => {
    expect(marcaDelAmbiente("simulado")).toBe(" (simulada)");
    expect(marcaDelAmbiente("prueba")).toBe(" (de prueba)");
    expect(marcaDelAmbiente("produccion")).toBe("");
  });
});

describe("«Probar la conexión»", () => {
  it("muestra si responde y los folios que quedan de cada tipo", async () => {
    d.probarConexionConFacturacionCl.mockResolvedValue({
      ambiente: "prueba",
      sin_conexion: null,
      servicio: { en_linea: true, version: "1.2.8.3", ms: 380, error: null },
      folios: [
        {
          tipo: 33,
          ms: 120,
          siguiente: 12,
          hasta: 50,
          libres: 39,
          vence: null,
        },
        { tipo: 39, ms: 110, error: "sin folios" },
      ],
    });
    render(<ProbarLaConexion />);
    fireEvent.click(screen.getByText("Probar la conexión"));
    expect(
      await screen.findByText(
        "facturacion.cl responde en 0,4 s (versión 1.2.8.3).",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/quedan 39 folios, sigue el N° 12/),
    ).toBeInTheDocument();
    expect(screen.getByText("sin folios")).toBeInTheDocument();
  });

  it("en el simulado dice que no hay folios que mostrar", async () => {
    d.probarConexionConFacturacionCl.mockResolvedValue({
      ambiente: "simulado",
      sin_conexion: null,
      servicio: { en_linea: true, version: "1.2.8.3", ms: 200, error: null },
      folios: [],
    });
    render(<ProbarLaConexion />);
    fireEvent.click(screen.getByText("Probar la conexión"));
    expect(
      await screen.findByText(
        "Sin credenciales, el simulado no tiene folios que mostrar.",
      ),
    ).toBeInTheDocument();
  });
});
