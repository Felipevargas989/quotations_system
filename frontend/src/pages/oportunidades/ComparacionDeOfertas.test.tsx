// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as comparacion from "../../services/comparacion.service";
import * as oportunidades from "../../services/oportunidades.service";
import ComparacionDeOfertas from "./ComparacionDeOfertas";

// LA COMPARACIÓN DE OFERTAS (decisión 41, 19-10). Felipe: "cargamos ambas
// ofertas, la mía va a salir de acá, la otra la descargo y la sumo, y que la
// IA analice porcentualmente quién cumple mejor según cada parámetro".

vi.mock("../../services/comparacion.service", () => ({
  getComparacion: vi.fn(),
  pedirComparacion: vi.fn(),
  subirOfertaDeCompetidor: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  borrarAdjunto: vi.fn(),
}));
const c = vi.mocked(comparacion);
const o = vi.mocked(oportunidades);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const archivo = (id: number, nombre: string, competidor: string | null) => ({
  id,
  nombre,
  ruta: `c1/x/${id}`,
  tipo: "application/pdf",
  bytes: 2048,
  origen: "subido",
  viene_de: null,
  competidor,
  creado_en: "2026-10-19T21:00:00.000Z",
  subido_por: null,
  quien: null,
});

const pintar = ({
  competencia = [] as unknown[],
  mias = [archivo(1, "Formulario N°5 - firmado.pdf", null)] as unknown[],
  trabajo = null as unknown,
} = {}) => {
  o.getAdjuntos.mockImplementation((_id, seccion) =>
    Promise.resolve((seccion === "competencia" ? competencia : mias) as never),
  );
  c.getComparacion.mockResolvedValue(trabajo as never);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ComparacionDeOfertas oportunidadId={84} />
    </QueryClientProvider>,
  );
};

describe("Comparación de ofertas", () => {
  it("sin competencia no se compara; para subir hay que escribir de quién es", async () => {
    pintar();
    expect(
      await screen.findByText(/lo que está en «Mi postulación» \(1 archivo\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Comparar con IA/ }),
    ).toBeDisabled();
    const elegir = screen.getByRole("button", { name: /Elegir sus archivos/ });
    expect(elegir).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/De qué oferente es la oferta/), {
      target: { value: "Sol de Quillón SpA" },
    });
    expect(elegir).toBeEnabled();
  });

  it("sube los archivos con el nombre del oferente y los muestra agrupados", async () => {
    c.subirOfertaDeCompetidor.mockResolvedValue({} as never);
    const { container } = pintar({
      competencia: [
        archivo(31, "Formulario N°5.pdf", "SOL DE QUILLON SPA"),
        archivo(32, "Formulario N°4.pdf", "SOL DE QUILLON SPA"),
        archivo(33, "Oferta.pdf", "BPM EVENTOS SPA"),
      ],
    });
    expect(await screen.findByText("La competencia (2)")).toBeInTheDocument();
    const sol = screen.getByText("SOL DE QUILLON SPA")
      .parentElement as HTMLElement;
    expect(within(sol).getByText("Formulario N°4.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Comparar con IA/ }),
    ).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/De qué oferente es la oferta/), {
      target: { value: "  Eventos del Sur " },
    });
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const pdf = new File(["%PDF"], "Oferta técnica.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [pdf] } });
    await waitFor(() =>
      expect(c.subirOfertaDeCompetidor).toHaveBeenCalledWith(
        84,
        pdf,
        "Eventos del Sur",
      ),
    );
  });

  it("muestra quién ganaría, la nota de cada criterio, el puntaje y la probabilidad", async () => {
    pintar({
      competencia: [archivo(31, "Formulario N°5.pdf", "SOL DE QUILLON SPA")],
      trabajo: {
        id: 40,
        estado: "listo",
        tipo: "comparacion",
        modelo: "claude-opus-5-5",
        costo_usd: 1.2,
        no_leidos: [],
        error: null,
        creado_en: "2026-10-19T21:10:00.000Z",
        terminado_en: "2026-10-19T21:13:00.000Z",
        resultado: {
          resumen: "Sol de Quillón va mejor por precio.",
          ganador_probable: "SOL DE QUILLON SPA",
          criterios: [
            { nombre: "Oferta económica", peso: 40 },
            { nombre: "Experiencia", peso: 60 },
          ],
          oferentes: [
            {
              nombre: "VALLE DEL SOL QUILLON SPA",
              es_tuya: true,
              precio: "$15.900.000 IVA incluido",
              cumple_bases: "si",
              por_que: "",
              notas: [
                { criterio: 1, nota: 75, fundamento: "Más caro." },
                { criterio: 2, nota: 100, fundamento: "10 servicios." },
              ],
              probabilidad: 40,
              fortalezas: ["Experiencia"],
              debilidades: ["Precio"],
              puntaje: 90,
            },
            {
              nombre: "SOL DE QUILLON SPA",
              es_tuya: false,
              precio: "$12.000.000 neto",
              cumple_bases: "dudoso",
              por_que: "No se ve su patente.",
              notas: [
                { criterio: 1, nota: 100, fundamento: "El más barato." },
                { criterio: 2, nota: 90, fundamento: "9 servicios." },
              ],
              probabilidad: 60,
              fortalezas: ["Precio"],
              debilidades: ["Patente"],
              puntaje: 94,
            },
          ],
          para_la_proxima: ["Bajar el precio."],
        },
      },
    });
    expect(
      await screen.findByText("Lo más probable: gana SOL DE QUILLON SPA (60%)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Oferta económica")).toBeInTheDocument();
    expect(screen.getByText("94")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getAllByText("Por confirmar")[0]).toHaveAttribute(
      "title",
      "No se ve su patente.",
    );
    expect(screen.getByText("Bajar el precio.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Volver a comparar/ }),
    ).toBeEnabled();
    expect(screen.getByText(/costó US\$1,20/)).toBeInTheDocument();
  });

  it("pide la comparación y espera mientras la IA trabaja", async () => {
    c.pedirComparacion.mockResolvedValue({
      id: 41,
      estado: "procesando",
    } as never);
    pintar({ competencia: [archivo(31, "Oferta.pdf", "BPM EVENTOS SPA")] });
    const boton = await screen.findByRole("button", {
      name: /Comparar con IA/,
    });
    // Se habilita cuando llega la oferta del competidor.
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    await waitFor(() => expect(c.pedirComparacion).toHaveBeenCalledWith(84));
    expect(
      await screen.findByText(/La IA está leyendo las ofertas/),
    ).toBeInTheDocument();
  });
});
