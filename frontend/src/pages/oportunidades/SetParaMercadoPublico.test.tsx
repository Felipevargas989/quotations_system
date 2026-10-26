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
import * as servicio from "../../services/postulacion.service";
import SetParaMercadoPublico from "./SetParaMercadoPublico";

// «Descargar para Mercado Público» (decisión 34, sprint I, 19-10). Desde la
// decisión 79 (26-10), al final del paso 3: «Descargar el ZIP» baja de una y
// «Ver qué lleva» muestra lo que falta y cada archivo en su carpeta.

vi.mock("../../services/postulacion.service", () => ({
  getSetParaMercadoPublico: vi.fn(),
  descargarSetParaMercadoPublico: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const pintar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SetParaMercadoPublico oportunidadId={40} codigo="1532886-5-LE26" />
    </QueryClientProvider>,
  );

const SET = {
  piezas: [
    {
      nombre: "Formularios_Anexos - firmado.docx",
      carpetas: ["1. Administrativa", "2. Técnica"],
      que_es: "formulario" as const,
      aviso: null,
    },
    {
      nombre: "F30 septiembre.pdf",
      carpetas: ["1. Administrativa"],
      que_es: "documento" as const,
      aviso: "vencido el 01-10-2026",
    },
    {
      nombre: "OC 4352-103-SE23.pdf",
      carpetas: ["2. Técnica/Respaldos de experiencia"],
      que_es: "respaldo" as const,
      aviso: null,
    },
  ],
  faltan: [
    "«Certificado F30» venció el 01-10-2026: súbelo renovado en «Mi empresa».",
  ],
  bytes: 3 * 1024 * 1024,
};

describe("El set para Mercado Público", () => {
  it("no revisa nada hasta que se pide, y el ZIP se puede bajar de una", () => {
    pintar();
    expect(s.getSetParaMercadoPublico).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Descargar el ZIP" }),
    ).toBeEnabled();
  });

  it("muestra lo que falta y cada archivo en su carpeta, como queda en el ZIP", async () => {
    s.getSetParaMercadoPublico.mockResolvedValue(SET);
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Ver qué lleva" }));
    expect(await screen.findByText("Antes de subir (1)")).toBeInTheDocument();
    expect(s.getSetParaMercadoPublico).toHaveBeenCalledWith(40);
    expect(
      screen.getByText(
        "«Certificado F30» venció el 01-10-2026: súbelo renovado en «Mi empresa».",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1. Administrativa")).toBeInTheDocument();
    expect(screen.getByText("2. Técnica")).toBeInTheDocument();
    // El anexo va en las dos partes.
    expect(
      screen.getAllByText("Formularios_Anexos - firmado.docx"),
    ).toHaveLength(2);
    expect(screen.getByText("Respaldos de experiencia/")).toBeInTheDocument();
    expect(screen.getByText("vencido el 01-10-2026")).toBeInTheDocument();
    expect(screen.getByText(/3 archivos · 3 MB/)).toBeInTheDocument();
  });

  it("baja el ZIP con el código de la licitación en el nombre", async () => {
    s.getSetParaMercadoPublico.mockResolvedValue(SET);
    s.descargarSetParaMercadoPublico.mockResolvedValue(
      new Blob(["zip"], { type: "application/zip" }),
    );
    const crear = vi.fn(() => "blob:zip");
    const soltar = vi.fn();
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: soltar });
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("Postulación 1532886-5-LE26.zip");
      });
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Descargar el ZIP" }));
    await waitFor(() => expect(clic).toHaveBeenCalled());
    // Sin revisar antes: el motor arma el ZIP con lo que hay.
    expect(s.getSetParaMercadoPublico).not.toHaveBeenCalled();
    expect(s.descargarSetParaMercadoPublico).toHaveBeenCalledWith(40);
    expect(soltar).toHaveBeenCalledWith("blob:zip");
  });
});
