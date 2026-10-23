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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "../../components/toast/Toast";
import * as servicio from "../../services/oportunidades.service";
import AdjuntosDeLaOportunidad from "./AdjuntosDeLaOportunidad";
import { claveDeTraer } from "./useEstadoDeTraer";

// «TRAER LOS DOCUMENTOS» (decisión 65, 21-10). Felipe: "un botón de bajar
// documentos y que lo lleve directamente". El motor va de mentira.

vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  subirAdjunto: vi.fn(),
  borrarAdjunto: vi.fn(),
  traerAdjuntos: vi.fn(),
  getEstadoDeTraer: vi.fn(),
}));
vi.mock("../../components/FileViewLink", () => ({ default: () => null }));
vi.mock("./descargas", () => ({ descargarDelBalde: vi.fn() }));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
const s = vi.mocked(servicio);
const t = vi.mocked(toast);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const adjunto = (id: number, nombre: string) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/9/${nombre}`,
  tipo: "application/pdf",
  bytes: 1000,
  seccion: "bases" as const,
  origen: "subido" as const,
  viene_de: null,
  competidor: null,
  creado_en: "2026-10-21T12:00:00.000Z",
  subido_por: null,
  quien: null,
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AdjuntosDeLaOportunidad oportunidadId={9} />
    </QueryClientProvider>,
  );

describe("Traer los documentos", () => {
  beforeEach(() => {
    s.getEstadoDeTraer.mockResolvedValue({ trayendo: false });
  });

  it("al volver a la ficha mientras el motor trae: «Trayendo…» sigue a la vista, no deja apretar de nuevo y, al terminar, la lista se pide otra vez (23-10)", async () => {
    // Felipe salió mientras bajaba un PDF de 12 MB, volvió, vio el botón
    // libre, apretó otra vez y el PDF quedó repetido.
    s.getAdjuntos
      .mockResolvedValueOnce([adjunto(2, "Formularios Anexos.docx")])
      .mockResolvedValue([
        adjunto(2, "Formularios Anexos.docx"),
        adjunto(1, "Bases.pdf"),
      ]);
    s.getEstadoDeTraer
      .mockResolvedValueOnce({ trayendo: true })
      .mockResolvedValue({ trayendo: false });
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={cliente}>
        <AdjuntosDeLaOportunidad oportunidadId={9} />
      </QueryClientProvider>,
    );
    const boton = await screen.findByRole("button", { name: /Trayendo…/ });
    expect(boton).toBeDisabled();
    expect(
      screen.getByText("Puedes salir de la ficha: aparecen solos al terminar."),
    ).toBeInTheDocument();
    expect(s.traerAdjuntos).not.toHaveBeenCalled();

    // El motor termina: la próxima pregunta dice que ya no trae.
    await cliente.invalidateQueries({ queryKey: claveDeTraer(9) });
    expect(
      await screen.findByRole("button", { name: /Traer los documentos/ }),
    ).toBeEnabled();
    expect(await screen.findByText("Bases.pdf")).toBeInTheDocument();
    expect(s.getAdjuntos).toHaveBeenCalledTimes(2);
  });

  it("pide los documentos al motor, dice cuántos llegaron y refresca la lista", async () => {
    s.getAdjuntos
      .mockResolvedValueOnce([])
      .mockResolvedValue([adjunto(1, "Bases.pdf"), adjunto(2, "Anexos.docx")]);
    s.traerAdjuntos.mockResolvedValue({
      disponibles: 3,
      bajados: [adjunto(1, "Bases.pdf"), adjunto(2, "Anexos.docx")],
      omitidos: [{ nombre: "Ficha.pdf", motivo: "ya estaba" }],
    });
    pintar();
    const boton = await screen.findByRole("button", {
      name: /Traer los documentos/,
    });
    // El enlace a Mercado Público vive en la cabecera de la ficha
    // (decisión 66): aquí no se repite.
    expect(
      screen.queryByRole("link", { name: /Mercado Público/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(boton);
    await waitFor(() => expect(s.traerAdjuntos).toHaveBeenCalledWith(9));
    await waitFor(() =>
      expect(t.success).toHaveBeenCalledWith(
        "Llegaron 2 archivos (1 ya estaba).",
      ),
    );
    expect(await screen.findByText("Bases.pdf")).toBeInTheDocument();
  });

  it("si Licify no conoce el proceso, lo dice y manda al camino a mano", async () => {
    s.getAdjuntos.mockResolvedValue([]);
    s.traerAdjuntos.mockResolvedValue({
      disponibles: 0,
      bajados: [],
      omitidos: [],
    });
    pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: /Traer los documentos/ }),
    );
    await waitFor(() =>
      expect(t.warn).toHaveBeenCalledWith(
        expect.stringMatching(/Licify todavía no tiene/),
      ),
    );
  });

  it("si el motor falla, avisa con su mensaje", async () => {
    s.getAdjuntos.mockResolvedValue([]);
    s.traerAdjuntos.mockRejectedValue({
      response: { data: { message: "Licify respondió 500." } },
    });
    pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: /Traer los documentos/ }),
    );
    await waitFor(() => expect(t.error).toHaveBeenCalled());
  });
});
