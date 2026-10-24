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
import * as editor from "../../services/editorDelWord.service";
import type { AdjuntoDeOportunidad } from "../../services/oportunidades.service";
import EditorDeWord from "./EditorDeWord";

// EL WORD SE EDITA EN EVENTIA (decisión 78): se abre, se escribe encima y
// se mandan solo los párrafos que cambiaron; salir con cambios pregunta.

vi.mock("../../services/editorDelWord.service", () => ({
  abrirElWord: vi.fn(),
  guardarElWord: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const e = vi.mocked(editor);

const ADJUNTO = {
  id: 13,
  nombre: "Formulario N°4 - Calidad de la oferta - lleno.docx",
  ruta: "c1/oportunidades/40/postulacion/x.docx",
} as AdjuntoDeOportunidad;

const WORD: editor.WordParaEditar = {
  version: "a".repeat(40),
  bloques: [
    {
      tipo: "parrafo",
      id: 0,
      editable: true,
      formato: { b: false, i: false, u: false },
      alineacion: "centro",
      tramos: [{ r: 0, t: "FORMULARIO N°4", b: true, i: false, u: false }],
    },
    {
      tipo: "tabla",
      filas: [
        [
          {
            ancho: 75,
            bloques: [
              {
                tipo: "parrafo",
                id: 1,
                editable: true,
                formato: { b: false, i: false, u: false },
                tramos: [
                  {
                    r: 0,
                    t: "[COMPLETAR: tamaño de la piscina]",
                    b: false,
                    i: false,
                    u: false,
                  },
                ],
              },
            ],
          },
          {
            bloques: [
              {
                tipo: "parrafo",
                id: 2,
                editable: false,
                motivo: "tiene una imagen",
                formato: { b: false, i: false, u: false },
                tramos: [],
              },
            ],
          },
        ],
      ],
    },
  ],
};

let onCerrar: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  onCerrar = vi.fn<() => void>();
  e.abrirElWord.mockResolvedValue(WORD);
  e.guardarElWord.mockResolvedValue(ADJUNTO);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EditorDeWord oportunidadId={40} adjunto={ADJUNTO} onCerrar={onCerrar} />
    </QueryClientProvider>,
  );

/** Escribe en un párrafo: cambia el texto de su pedazo y avisa. */
const escribir = (id: number, texto: string) => {
  const el = document.querySelector<HTMLElement>(`[data-p="${id}"]`);
  const span = el?.querySelector("span");
  if (!el || !span) throw new Error(`sin párrafo ${id}`);
  span.textContent = texto;
  fireEvent.input(el);
};

describe("Editor de Word", () => {
  it("muestra el Word para escribir encima, con lo pendiente y lo que no se edita", async () => {
    pintar();
    expect(await screen.findByText("FORMULARIO N°4")).toBeInTheDocument();
    expect(
      screen.getByText("[COMPLETAR: tamaño de la piscina]").tagName,
    ).toBe("MARK");
    expect(screen.getByText(/Queda 1 por completar/)).toBeInTheDocument();
    expect(screen.getByText("[tiene una imagen]")).toHaveAttribute(
      "title",
      expect.stringContaining("No se edita aquí"),
    );
    expect(document.querySelector('[data-p="0"]')).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });

  it("guarda solo el párrafo que cambió, con su corrida y su formato", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    escribir(1, "12 x 6 metros");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    expect(screen.queryByText(/por completar/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar en el Word" }));
    await waitFor(() =>
      expect(e.guardarElWord).toHaveBeenCalledWith(40, 13, "a".repeat(40), [
        {
          id: 1,
          tramos: [{ r: 0, t: "12 x 6 metros", b: false, i: false, u: false }],
        },
      ]),
    );
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });

  it("sin cambios, «Guardar» solo cierra", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    fireEvent.click(screen.getByRole("button", { name: "Guardar en el Word" }));
    expect(e.guardarElWord).not.toHaveBeenCalled();
    expect(onCerrar).toHaveBeenCalled();
  });

  it("salir con cambios pregunta antes", async () => {
    pintar();
    await screen.findByText("FORMULARIO N°4");
    escribir(0, "FORMULARIO N°4 (corregido)");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tienes cambios sin guardar. ¿Salir sin guardarlos?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(onCerrar).toHaveBeenCalled();
  });
});
