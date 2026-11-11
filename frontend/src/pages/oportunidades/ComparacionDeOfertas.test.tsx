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
  getEstadoDeTraerOfertas: vi.fn(),
  traerOfertas: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  borrarAdjunto: vi.fn(),
  subirAdjunto: vi.fn(),
}));
// Lo que aprendemos de la comisión (decisión 60) tiene su propia prueba.
vi.mock("../../services/aprendizajes.service", () => ({
  getAprendizajes: vi.fn(() =>
    Promise.resolve({ comision: [], total: 0, trabajo: null }),
  ),
  pedirAprendizaje: vi.fn(),
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
  esLicitacion = false,
} = {}) => {
  o.getAdjuntos.mockImplementation((_id, seccion) =>
    Promise.resolve(
      (seccion === "competencia"
        ? competencia
        : seccion === "acta"
          ? []
          : mias) as never,
    ),
  );
  c.getComparacion.mockResolvedValue(trabajo as never);
  c.getEstadoDeTraerOfertas.mockResolvedValue({
    trayendo: false,
    ultima: null,
  });
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ComparacionDeOfertas
        oportunidadId={84}
        adjudicada={false}
        esLicitacion={esLicitacion}
      />
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
              graves: [
                {
                  que: "Su oferta pasa del presupuesto",
                  prueba: "Formulario N°5, página 1",
                  regla: "Punto 11 de las bases",
                  por_ausencia: false,
                },
              ],
              reclamo: "Señores\nI MUNICIPALIDAD DE QUILLON",
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
    // Decisión 59: lo grave de un competidor, con su reclamo; la tuya, no.
    expect(
      screen.getByText("Su oferta pasa del presupuesto"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Redactar reclamo/ }),
    ).toHaveLength(1);
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

  it("en una licitación, «Traer las ofertas» va en «La competencia»; en una compra ágil no hay qué traer (decisión 123)", async () => {
    // Felipe, 10-11, con una postulada ya cerrada: "acá eventia no me puede
    // traer los documentos de la otra propuesta" y "con un botón acá en
    // eventia".
    const { unmount } = pintar({ esLicitacion: true });
    const titulo = await screen.findByText("La competencia (0)");
    const boton = screen.getByRole("button", { name: /Traer las ofertas/ });
    expect(titulo.parentElement).toContainElement(boton);
    await waitFor(() => expect(boton).toBeEnabled());
    expect(c.getEstadoDeTraerOfertas).toHaveBeenCalledWith(84);
    expect(
      screen.getByText(/«Traer las ofertas» baja del cuadro de ofertas/),
    ).toBeInTheDocument();
    // Subir a mano sigue ahí.
    expect(
      screen.getByLabelText(/De qué oferente es la oferta/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Comparar con IA/ }),
    ).toHaveAttribute(
      "title",
      "Trae o sube primero la oferta de al menos un competidor",
    );
    unmount();
    vi.clearAllMocks();

    pintar();
    await screen.findByText("La competencia (0)");
    expect(
      screen.queryByRole("button", { name: /Traer las ofertas/ }),
    ).not.toBeInTheDocument();
    expect(c.getEstadoDeTraerOfertas).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Baja del cuadro de ofertas de Mercado Público/),
    ).toBeInTheDocument();
  });
});
