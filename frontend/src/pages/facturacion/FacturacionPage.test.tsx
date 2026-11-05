// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FacturacionPage from "./FacturacionPage";

// UNA SOLA SECCIÓN «FACTURACIÓN» (doc 19 §9.19, 05-11): cada cargo ve sus
// pestañas. Recepción, las boletas; operaciones, además «Documentos»; el
// administrador, todo y el tarifario.

let rol = "recepcion";
let cobros: unknown[] = [];
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ userRole: rol }),
}));
vi.mock("../boletas/consultas", () => ({
  usePorBoletear: () => ({
    data: { ambiente: "simulado", cobros },
    isSuccess: true,
  }),
  useEmitidasHoy: () => ({
    data: { ambiente: "simulado", fecha: "2026-11-05", boletas: [] },
  }),
}));
vi.mock("./DocumentosDelMes", () => ({
  default: () => <p>lista de documentos</p>,
}));
vi.mock("../boletas/Boletas", () => ({
  default: ({ pestana }: { pestana: string }) => <p>boletas: {pestana}</p>,
}));

const pestanas = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.textContent?.replace(/ \(\d+\)$/, ""));

afterEach(() => {
  cleanup();
  rol = "recepcion";
  cobros = [];
});

describe("la sección Facturación", () => {
  it("recepción ve solo las boletas y parte en la boleta suelta", () => {
    render(<FacturacionPage />);
    expect(pestanas()).toEqual([
      "Boleta suelta",
      "Por boletear",
      "Emitidas hoy",
    ]);
    expect(screen.getByText("boletas: suelta")).toBeInTheDocument();
    expect(
      screen.getByText(/Modo simulado: .*Las boletas/),
    ).toBeInTheDocument();
  });

  it("con algo por boletear, recepción parte ahí", () => {
    cobros = [{ id: 1 }];
    render(<FacturacionPage />);
    expect(screen.getByText("boletas: por_boletear")).toBeInTheDocument();
  });

  it("operaciones ve además Documentos y parte ahí, sin el tarifario", () => {
    rol = "operaciones";
    render(<FacturacionPage />);
    expect(pestanas()).toEqual([
      "Documentos",
      "Boleta suelta",
      "Por boletear",
      "Emitidas hoy",
    ]);
    expect(screen.getByText("lista de documentos")).toBeInTheDocument();
  });

  it("el administrador ve todo, con el tarifario", () => {
    rol = "administrador";
    render(<FacturacionPage />);
    expect(pestanas()).toEqual([
      "Documentos",
      "Boleta suelta",
      "Por boletear",
      "Emitidas hoy",
      "Tarifario",
    ]);
  });
});
