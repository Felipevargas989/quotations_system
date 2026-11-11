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
import * as aprendizajes from "../../services/aprendizajes.service";
import * as oportunidades from "../../services/oportunidades.service";
import AprenderDelActa from "./AprenderDelActa";

// LO QUE APRENDEMOS DE LA COMISIÓN (decisión 60, 20-10). Felipe: "ir
// revisando las actas de adjudicación e ir entrenando la IA para que vaya
// afinando el ojo". Y EL ACTA LLEGA SOLA (decisión 128, 11-11): "subir el
// acta de evaluación debería también ser automático".

vi.mock("../../services/aprendizajes.service", () => ({
  getAprendizajes: vi.fn(),
  pedirAprendizaje: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  borrarAdjunto: vi.fn(),
  subirAdjunto: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
const a = vi.mocked(aprendizajes);
const o = vi.mocked(oportunidades);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CASO = {
  id: 2,
  codigo: "4364-5-LE25",
  unidad: "4364",
  organismo: "I. Municipalidad de Quillón (DAEM)",
  situacion: "Faltó la declaración del programa de integridad.",
  decision: "Puso 0 en integridad y siguió en carrera.",
  tipo: "flexible" as const,
  fuente: "caso" as const,
  oportunidad_id: null,
  creado_en: "2026-10-20T18:00:00.000Z",
};

const acta = (de: Record<string, unknown> = {}) => ({
  id: 61,
  nombre: "Acta de evaluación.pdf",
  ruta: "c1/x/61",
  tipo: "application/pdf",
  bytes: 2048,
  origen: "subido",
  viene_de: null,
  competidor: null,
  creado_en: "2026-10-27T12:00:00.000Z",
  subido_por: "perfil-1",
  quien: { full_name: "Felipe Vargas" },
  ...de,
});

const LISTO = {
  id: 70,
  estado: "listo",
  tipo: "aprendizaje",
  modelo: "claude-opus-5-5",
  costo_usd: 0.4,
  no_leidos: [],
  error: null,
  creado_en: "2026-10-27T12:00:00.000Z",
  terminado_en: "2026-10-27T12:02:00.000Z",
  resultado: {
    ganador: "VALLE DEL SOL QUILLON SPA",
    prediccion: "fallo",
    por_que: "La comisión no exigió el programa de integridad.",
    resumen: "Revisó con una tabla de sí/no.",
    aprendizajes: [
      {
        situacion: "El anexo económico pasaba del presupuesto.",
        decision: "La dejó fuera.",
        tipo: "estricta",
      },
    ],
    guardados: 1,
  },
};

const pintar = ({
  trabajo = null as unknown,
  actas = [] as unknown[],
  actaPublicada = false,
} = {}) => {
  a.getAprendizajes.mockResolvedValue({
    comision: [CASO],
    total: 43,
    trabajo,
  } as never);
  o.getAdjuntos.mockResolvedValue(actas as never);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AprenderDelActa oportunidadId={84} actaPublicada={actaPublicada} />
    </QueryClientProvider>,
  );
};

describe("Lo que aprendemos de la comisión", () => {
  it("muestra cómo ha decidido esta comisión y cuánto tiene la base; sin acta ni adjudicación publicada no se aprende", async () => {
    pintar();
    expect(
      await screen.findByText("Cómo ha decidido esta comisión (1)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Faltó la declaración del programa de integridad/),
    ).toBeInTheDocument();
    expect(screen.getByText("Flexible")).toBeInTheDocument();
    expect(
      screen.getByText("La base tiene 43 decisiones de comisiones."),
    ).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /Aprender del acta/ });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute(
      "title",
      "Todavía no hay acta: llega con la adjudicación, o súbela",
    );
    // Subirla a mano sigue ahí.
    expect(screen.getByRole("button", { name: /Subir el acta/ })).toBeEnabled();
    expect(screen.queryByText(/llegó sola/)).not.toBeInTheDocument();
  });

  it("con el acta subida a mano, «Aprender del acta» la manda a leer", async () => {
    a.pedirAprendizaje.mockResolvedValue({
      id: 70,
      estado: "procesando",
    } as never);
    pintar({ actas: [acta()] });
    expect(
      await screen.findByText("Acta de evaluación.pdf"),
    ).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /Aprender del acta/ });
    await waitFor(() => expect(boton).toBeEnabled());
    // La subió una persona: no «llegó sola».
    expect(screen.queryByText(/llegó sola/)).not.toBeInTheDocument();
    fireEvent.click(boton);
    await waitFor(() => expect(a.pedirAprendizaje).toHaveBeenCalledWith(84));
  });

  it("decisión 128: adjudicada y sin acta, el botón la trae de Mercado Público y la lee", async () => {
    a.pedirAprendizaje.mockResolvedValue({
      id: 70,
      estado: "procesando",
    } as never);
    pintar({ actaPublicada: true });
    const boton = await screen.findByRole("button", {
      name: /Traer el acta y aprender/,
    });
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    await waitFor(() => expect(a.pedirAprendizaje).toHaveBeenCalledWith(84));
  });

  it("decisión 128: la que trajo Eventia dice que llegó sola, y si ya se leyó", async () => {
    // Llegó el 20-11 a las 12:40 de Chile; nadie la subió.
    const sola = acta({
      nombre: "ACTA DE EVALUACIÓN.pdf",
      creado_en: "2026-11-20T15:40:00.000Z",
      subido_por: null,
      quien: null,
    });
    pintar({ actas: [sola], actaPublicada: true });
    expect(
      await screen.findByText("Acta de evaluación: llegó sola el 20-11"),
    ).toBeInTheDocument();
    // Con el acta ya aquí, el botón solo la lee.
    expect(
      screen.getByRole("button", { name: /Aprender del acta/ }),
    ).toBeInTheDocument();
    cleanup();

    pintar({ actas: [sola], actaPublicada: true, trabajo: LISTO });
    expect(
      await screen.findByText(
        "Acta de evaluación: llegó sola el 20-11 y ya se leyó",
      ),
    ).toBeInTheDocument();
  });

  it("lo aprendido: si la comparación acertó, quién ganó y cada decisión con su tipo", async () => {
    pintar({ trabajo: LISTO });
    expect(await screen.findByText("La comparación falló")).toBeInTheDocument();
    expect(
      screen.getByText(/Ganó: VALLE DEL SOL QUILLON SPA/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("La comisión no exigió el programa de integridad."),
    ).toBeInTheDocument();
    expect(screen.getByText("Estricta")).toBeInTheDocument();
    expect(
      screen.getByText(/Quedó 1 decisión nueva en la base/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Volver a aprender/ }),
    ).toBeInTheDocument();
  });
});
