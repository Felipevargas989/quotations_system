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
import * as servicio from "../../services/preguntas.service";
import PreguntasALaIA from "./PreguntasALaIA";

// PREGÚNTALE A LA IA SOBRE ESTAS BASES (decisión 67, 22-10). Felipe: "no
// tengo cómo preguntar ni interactuar... poder precisar cosas y que no
// vuelva a releer todo".

vi.mock("../../services/preguntas.service", () => ({
  getPreguntas: vi.fn(),
  preguntar: vi.fn(),
  confirmarPregunta: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const RESPONDIDA: servicio.PreguntaALaIA = {
  id: 3,
  oportunidad_id: 84,
  pregunta: "¿Las colaciones son por día o en total?",
  estado: "listo",
  respuesta: "Por día: 300 y 300 en total.",
  citas: [
    { documento: "Ficha técnica 36", pagina: 3, texto: "40 almuerzos diarios" },
  ],
  seguridad: "media",
  error: null,
  modelo: "claude-opus-5-5",
  tokens_cache_leida: 90000,
  costo_usd: 0.05,
  quien: { full_name: "Felipe Vargas" },
  creado_en: "2026-10-22T20:50:00.000Z",
  terminado_en: "2026-10-22T20:50:09.000Z",
};

const pintar = (hilo: servicio.PreguntaALaIA[] = []) => {
  s.getPreguntas.mockResolvedValue(hilo);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PreguntasALaIA oportunidadId={84} />
    </QueryClientProvider>,
  );
};

describe("Pregúntale a la IA sobre estas bases", () => {
  it("muestra el hilo con la respuesta, sus citas y lo que costó", async () => {
    pintar([RESPONDIDA]);
    expect(
      await screen.findByText("¿Las colaciones son por día o en total?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Por día: 300 y 300 en total."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/«40 almuerzos diarios» — Ficha técnica 36, pág. 3/),
    ).toBeInTheDocument();
    const pie = screen.getByText(/Es una deducción/);
    expect(pie.textContent).toContain("claude-opus-5-5");
    expect(pie.textContent).toContain("0,05");
    expect(pie.textContent).toContain("con las bases en caché");
    expect(screen.getByText(/Felipe Vargas/)).toBeInTheDocument();
  });

  it("sin escribir nada avisa en línea y no pregunta", async () => {
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Preguntar" }));
    expect(
      screen.getByText("Escribe la pregunta primero."),
    ).toBeInTheDocument();
    expect(s.preguntar).not.toHaveBeenCalled();
  });

  it("al preguntar manda el texto limpio y muestra que está leyendo las bases", async () => {
    s.preguntar.mockResolvedValue({
      ...RESPONDIDA,
      id: 4,
      pregunta: "¿Hay garantía?",
      estado: "procesando",
      respuesta: null,
      citas: [],
      costo_usd: null,
    });
    pintar([RESPONDIDA]);
    const caja = await screen.findByLabelText("Pregunta");
    fireEvent.change(caja, { target: { value: "  ¿Hay garantía?  " } });
    fireEvent.submit(caja.closest("form")!);
    await waitFor(() =>
      expect(s.preguntar).toHaveBeenCalledWith(84, "¿Hay garantía?"),
    );
    expect(await screen.findByText("¿Hay garantía?")).toBeInTheDocument();
    expect(screen.getByText(/Leyendo las bases/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Respondiendo/ })).toBeDisabled();
    expect(caja).toHaveValue("");
  });

  it("una deducción no entra a la postulación hasta anotar lo que confirmó el comprador; al guardarlo, entra", async () => {
    s.confirmarPregunta.mockResolvedValue({
      ...RESPONDIDA,
      confirmado: "Son 100 AM y 100 PM por día (Rodrigo Pérez).",
    });
    pintar([RESPONDIDA]);
    expect(
      await screen.findByText(/No entra a la postulación hasta que anotes/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/La postulación usa/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Lo que confirmó el comprador"), {
      target: { value: "Son 100 AM y 100 PM por día (Rodrigo Pérez)." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(s.confirmarPregunta).toHaveBeenCalledWith(
        84,
        3,
        "Son 100 AM y 100 PM por día (Rodrigo Pérez).",
      ),
    );
    expect(
      await screen.findByText(/Lo confirmó el comprador:/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/La postulación usa 1 aclaración/),
    ).toBeInTheDocument();
  });

  it("lo que dicen los documentos entra solo, y se puede corregir con lo que dijo el comprador", async () => {
    pintar([{ ...RESPONDIDA, seguridad: "alta" }]);
    expect(
      await screen.findByText(
        /Lo dicen los documentos: entra a la postulación/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/La postulación usa 1 aclaración/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Corregir con lo que dijo el comprador",
      }),
    );
    expect(
      screen.getByLabelText("Lo que confirmó el comprador"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
  });
});
