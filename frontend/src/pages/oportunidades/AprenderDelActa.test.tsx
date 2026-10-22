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
// afinando el ojo".

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

const pintar = ({
  trabajo = null as unknown,
  actas = [] as unknown[],
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
      <AprenderDelActa oportunidadId={84} />
    </QueryClientProvider>,
  );
};

describe("Lo que aprendemos de la comisión", () => {
  it("muestra cómo ha decidido esta comisión y cuánto tiene la base; sin acta no se aprende", async () => {
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
    expect(
      screen.getByRole("button", { name: /Aprender del acta/ }),
    ).toBeDisabled();
  });

  it("con el acta subida, «Aprender del acta» la manda a leer", async () => {
    a.pedirAprendizaje.mockResolvedValue({
      id: 70,
      estado: "procesando",
    } as never);
    pintar({
      actas: [
        {
          id: 61,
          nombre: "Acta de evaluación.pdf",
          ruta: "c1/x/61",
          tipo: "application/pdf",
          bytes: 2048,
          origen: "subido",
          viene_de: null,
          competidor: null,
          creado_en: "2026-10-27T12:00:00.000Z",
          subido_por: null,
          quien: null,
        },
      ],
    });
    expect(
      await screen.findByText("Acta de evaluación.pdf"),
    ).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /Aprender del acta/ });
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    await waitFor(() => expect(a.pedirAprendizaje).toHaveBeenCalledWith(84));
  });

  it("lo aprendido: si la comparación acertó, quién ganó y cada decisión con su tipo", async () => {
    pintar({
      trabajo: {
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
      },
    });
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
