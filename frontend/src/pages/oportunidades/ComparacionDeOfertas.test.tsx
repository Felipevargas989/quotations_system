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
import { CASO, TEXTUM_L1, trabajoListo, VALLE } from "./comparacionDePrueba";

// LA COMPARACIÓN DE OFERTAS (decisión 41, 19-10). Felipe: "cargamos ambas
// ofertas, la mía va a salir de acá, la otra la descargo y la sumo, y que la
// IA analice porcentualmente quién cumple mejor según cada parámetro". Y POR
// LÍNEA, CON UN SOLO BOTÓN (decisión 125, 11-11): "recuerda que son dos
// líneas que se podrían postular de forma independiente"; "debemos mejorar
// esta interfaz"; con la maqueta, "mucho mejor, hazlo así". Y LO DE ABAJO,
// DESPUÉS DE LA RESOLUCIÓN (decisión 128, 11-11): "el reclamo creo que debe
// ser post resolución, si gano no reclamo, si pierdo sí, y debería ser una
// sección abajo... el para la próxima, lo eliminaremos, el resumen yo creo
// que igual".

vi.mock("../../services/comparacion.service", () => ({
  getComparacion: vi.fn(),
  pedirComparacion: vi.fn(),
  subirOfertaDeCompetidor: vi.fn(),
  getEstadoDeTraerOfertas: vi.fn(),
  traerOfertas: vi.fn(),
  getReclamos: vi.fn(),
  getPorQue: vi.fn(() => Promise.resolve(null)),
  pedirPorQue: vi.fn(),
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
  perdida = false,
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
        perdida={perdida}
        esLicitacion={esLicitacion}
      />
    </QueryClientProvider>,
  );
};

const DE_LA_COMPETENCIA = [
  archivo(31, "FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf", "TEXTUM"),
  archivo(32, "PATENTE TEXTUM.pdf", "TEXTUM"),
  archivo(33, "Formulario 4 - Calidad de la oferta.pdf", "BPM EVENTOS SPA"),
  archivo(34, "Anexo 4.pdf", "BLISS PRODUCCIONES"),
];

describe("Comparación de ofertas: en una compra ágil, las ofertas se suben a mano", () => {
  it("sin competencia no se compara; para subir hay que escribir de quién es", async () => {
    pintar();
    expect(await screen.findByText("La competencia (0)")).toBeInTheDocument();
    const comparar = screen.getByRole("button", { name: /Comparar con IA/ });
    expect(comparar).toBeDisabled();
    expect(comparar).toHaveAttribute(
      "title",
      "Sube primero la oferta de al menos un competidor",
    );
    // No hay cuadro de ofertas que traer.
    expect(
      screen.queryByRole("button", { name: /Traer/ }),
    ).not.toBeInTheDocument();
    expect(c.getEstadoDeTraerOfertas).not.toHaveBeenCalled();
    // Subir a mano viene abierto: es la única manera.
    const elegir = screen.getByRole("button", { name: /Elegir sus archivos/ });
    expect(elegir).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/De qué oferente es la oferta/), {
      target: { value: "Sol de Quillón SpA" },
    });
    expect(elegir).toBeEnabled();
  });

  it("sube los archivos con el nombre del oferente y los muestra por oferente; se pueden eliminar", async () => {
    c.subirOfertaDeCompetidor.mockResolvedValue({} as never);
    o.borrarAdjunto.mockResolvedValue(undefined as never);
    const { container } = pintar({
      competencia: [
        archivo(31, "Formulario N°5.pdf", "SOL DE QUILLON SPA"),
        archivo(32, "Formulario N°4.pdf", "SOL DE QUILLON SPA"),
        archivo(33, "Oferta.pdf", "BPM EVENTOS SPA"),
      ],
    });
    expect(await screen.findByText("La competencia (2)")).toBeInTheDocument();
    // Sin comparación todavía, cada oferente viene abierto, con sus archivos.
    const sol = screen
      .getByRole("button", { name: /SOL DE QUILLON SPA/ })
      .closest("li") as HTMLElement;
    expect(within(sol).getByText("2 archivos")).toBeInTheDocument();
    expect(within(sol).getByText("Formulario N°4.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Comparar con IA/ }),
    ).toBeEnabled();

    fireEvent.click(
      within(sol).getByRole("button", { name: "Eliminar Formulario N°4.pdf" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(o.borrarAdjunto).toHaveBeenCalledWith(84, 32));

    // En una compra ágil, «a mano» viene siempre abierto.
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

describe("Comparación de ofertas: en una licitación, un solo botón (decisión 125)", () => {
  it("«Traer y comparar» no necesita ofertas subidas: las trae y compara", async () => {
    c.pedirComparacion.mockResolvedValue({
      id: 41,
      estado: "procesando",
    } as never);
    pintar({ esLicitacion: true });
    expect(await screen.findByText("La competencia (0)")).toBeInTheDocument();
    expect(
      screen.getByText(/Trae del cuadro de ofertas de Mercado Público/),
    ).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: "Traer y comparar" });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    await waitFor(() => expect(c.pedirComparacion).toHaveBeenCalledWith(84));
    expect(
      await screen.findByText(/Trayendo las ofertas y comparando/),
    ).toBeInTheDocument();
    expect(boton).toBeDisabled();
  });

  it("«Traer las ofertas», sin comparar, queda junto a la lista (decisión 123); subir a mano, plegado", async () => {
    pintar({ esLicitacion: true });
    const titulo = await screen.findByText("La competencia (0)");
    const traer = screen.getByRole("button", { name: /Traer las ofertas/ });
    expect(titulo.parentElement).toContainElement(traer);
    await waitFor(() => expect(traer).toBeEnabled());
    expect(c.getEstadoDeTraerOfertas).toHaveBeenCalledWith(84);
    expect(
      screen.queryByLabelText(/De qué oferente es la oferta/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Subir una oferta a mano/ }),
    );
    expect(
      screen.getByLabelText(/De qué oferente es la oferta/),
    ).toBeInTheDocument();
  });

  it("si no hay nada en «Mi postulación», lo avisa; si la comparación falló, dice por qué", async () => {
    pintar({
      esLicitacion: true,
      mias: [],
      trabajo: {
        ...trabajoListo(null),
        estado: "error",
        archivos: [],
        no_leidos: [],
        costo_usd: null,
        error: "Solo tu empresa presentó oferta: no hay con quién comparar.",
      },
    });
    expect(
      await screen.findByText(/Solo tu empresa presentó oferta/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Intentado el/)).toBeInTheDocument();
    expect(
      await screen.findByText(/Todavía no hay nada en «Mi postulación»/),
    ).toBeInTheDocument();
  });
});

describe("Comparación de ofertas: el resultado, línea por línea (decisión 125)", () => {
  it("una tarjeta por línea, la tuya primero: puntaje, precio, estado y los dos desenlaces", async () => {
    pintar({
      esLicitacion: true,
      competencia: DE_LA_COMPETENCIA,
      trabajo: trabajoListo(),
    });
    const l1 = await screen.findByRole("article", {
      name: "Línea 1 · Alimentación",
    });
    const l2 = screen.getByRole("article", { name: "Línea 2 · Técnica" });
    // La línea en que compites va antes, aunque el motor la entregue después.
    expect(
      l1.compareDocumentPosition(l2) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(l1).getByText("Compites")).toBeInTheDocument();
    expect(within(l1).getByText("Tope $17.200.000")).toBeInTheDocument();
    expect(within(l2).getByText("No compites")).toBeInTheDocument();

    // Solo quienes postularon a la línea, con los números adelante.
    // (El nombre sale en su tarjeta y en la tabla de notas.)
    expect(within(l1).getAllByText("TEXTUM")).toHaveLength(2);
    expect(
      within(l1).getByText("Valle del Sol Quillon SPA (tú)"),
    ).toBeInTheDocument();
    expect(within(l1).queryByText("BPM EVENTOS SPA")).not.toBeInTheDocument();
    expect(within(l1).getAllByText("99,4")).toHaveLength(2);
    expect(
      within(l1).getByText("$16.855.993 IVA incluido"),
    ).toBeInTheDocument();
    // El estado en una palabra y el detalle chico debajo.
    expect(within(l1).getByText("En duda")).toBeInTheDocument();
    expect(within(l1).getByText("Sin café en la colación")).toBeInTheDocument();
    expect(within(l1).getByText("Cumple")).toBeInTheDocument();
    expect(within(l2).getByText("Fuera")).toBeInTheDocument();

    // Los dos desenlaces.
    expect(within(l1).getByText("Si les aceptan todo")).toBeInTheDocument();
    expect(
      within(l1).getByText("Gana TEXTUM por 0,6 puntos"),
    ).toBeInTheDocument();
    expect(within(l1).getByText("Ofertó $294.007 menos")).toBeInTheDocument();
    expect(
      within(l1).getByText("Si aplican las bases a la letra"),
    ).toBeInTheDocument();
    expect(within(l1).getByText("Ganas tú")).toBeInTheDocument();
    expect(within(l1).getByText("TEXTUM queda fuera")).toBeInTheDocument();
    expect(within(l2).getByText("Gana TEXTUM")).toBeInTheDocument();

    // La tabla de notas: abierta donde compites, plegada donde no.
    expect(within(l1).getByText("Oferta económica")).toBeInTheDocument();
    expect(within(l1).getByText("Probabilidad de ganar")).toBeInTheDocument();
    expect(within(l2).queryByText("Oferta económica")).not.toBeInTheDocument();
    fireEvent.click(
      within(l2).getByRole("button", { name: /Ver las notas de esta línea/ }),
    );
    expect(within(l2).getByText("Oferta económica")).toBeInTheDocument();

    // Arriba, cuándo, cuánto leyó y cuánto costó; el botón sigue siendo uno.
    expect(
      screen.getByText(
        /Comparado el .* · leyó 58 de 61 archivos · costó US\$2,30/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Traer y comparar" }),
    ).toBeEnabled();
  });

  it("lo que decide la línea, con dónde se ve y la regla de las bases; el reclamo ya no va en las tarjetas", async () => {
    pintar({
      esLicitacion: true,
      competencia: DE_LA_COMPETENCIA,
      trabajo: trabajoListo(),
    });
    const l1 = await screen.findByRole("article", {
      name: "Línea 1 · Alimentación",
    });
    expect(
      within(l1).getByText(
        "Lo que lo decide: A Textum le falta el café de la colación",
      ),
    ).toBeInTheDocument();
    expect(
      within(l1).getByText(
        "Dónde se ve: FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf, pág. 2",
      ),
    ).toBeInTheDocument();
    expect(within(l1).getByText(/Regla: «…o bien café/)).toBeInTheDocument();
    // En la línea a la que no postulaste, también se ve qué la decide.
    const l2 = screen.getByRole("article", { name: "Línea 2 · Técnica" });
    expect(
      within(l2).getByText(/Lo que lo decide: Si aceptan el Formulario N°4/),
    ).toBeInTheDocument();
    // Decisión 128: antes de la resolución no se reclama, ni se le pregunta
    // al motor por reclamos.
    expect(
      screen.queryByRole("button", { name: /reclamo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Reclamos" }),
    ).not.toBeInTheDocument();
    expect(c.getReclamos).not.toHaveBeenCalled();
  });

  it("cada oferta en una fila que se abre: lo que leyó de ella y, adentro, lo suyo de cada línea y sus archivos", async () => {
    pintar({
      esLicitacion: true,
      competencia: DE_LA_COMPETENCIA,
      trabajo: trabajoListo(),
    });
    expect(
      await screen.findByText("El detalle de cada oferta"),
    ).toBeInTheDocument();
    const fila = (nombre: RegExp) =>
      screen.getByRole("button", { name: nombre }).closest("li") as HTMLElement;
    // La tuya primero; de cada una, cuánto se leyó.
    const filas = screen
      .getAllByRole("button", { expanded: false })
      .map((b) => b.textContent ?? "")
      .filter((t) => /leyó \d/.test(t));
    expect(filas).toEqual([
      "Valle del Sol Quillon SPA (tú)leyó 15 de 15 archivos",
      "BLISS PRODUCCIONESleyó 12 de 12 archivos",
      "BPM EVENTOS SPAleyó 14 de 15 archivos · 2 sin traer",
      "TEXTUMleyó 15 de 15 archivos",
    ]);
    // Plegadas: lo de adentro no se ve hasta abrir.
    expect(screen.queryByText("Le suma")).not.toBeInTheDocument();

    // Textum postula a las dos líneas: una fila, con lo de cada línea.
    const textum = fila(/^TEXTUM/);
    fireEvent.click(within(textum).getByRole("button", { name: /^TEXTUM/ }));
    expect(
      within(textum).getByText("Línea 1 · Alimentación"),
    ).toBeInTheDocument();
    expect(within(textum).getByText("Línea 2 · Técnica")).toBeInTheDocument();
    expect(within(textum).getAllByText("Le suma")).toHaveLength(2);
    expect(within(textum).getAllByText("Le resta")).toHaveLength(2);
    expect(within(textum).getAllByText("Lo puede dejar fuera")).toHaveLength(2);
    expect(
      within(textum).getByText("Menor precio de la línea"),
    ).toBeInTheDocument();
    expect(
      within(textum).getByText("La colación no ofrece café"),
    ).toBeInTheDocument();
    // En la Línea 2 no tiene nada en contra: la columna guarda su lugar.
    expect(
      within(textum).getAllByText("Nada a la vista").length,
    ).toBeGreaterThan(0);
    // Sus archivos, adentro y plegados.
    fireEvent.click(
      within(textum).getByRole("button", { name: "Sus archivos (2)" }),
    );
    expect(within(textum).getByText("PATENTE TEXTUM.pdf")).toBeInTheDocument();

    // De BPM, lo que la IA no vio: de eso no afirma nada.
    const bpm = fila(/^BPM EVENTOS SPA/);
    fireEvent.click(
      within(bpm).getByRole("button", { name: /^BPM EVENTOS SPA/ }),
    );
    expect(
      within(bpm).getByText(
        "Sin traer de Mercado Público: EXPERIENCIA DEL OFERENTE OC.rar (viene comprimido); Toda la Documentacion.rar (viene comprimido).",
      ),
    ).toBeInTheDocument();
    expect(
      within(bpm).getByText(
        "Sin leer: planilla.xlsx (la IA lee PDF, Word e imágenes).",
      ),
    ).toBeInTheDocument();
  });

  it("al final, plegado, lo que la IA no leyó; el resumen y «para la próxima» ya no están (decisión 128)", async () => {
    // Una comparación de antes los trae guardados: tampoco se muestran.
    pintar({
      esLicitacion: true,
      trabajo: trabajoListo({
        ...CASO,
        para_la_proxima: ["Ajustar el precio."],
      }),
    });
    await screen.findByRole("article", { name: "Línea 1 · Alimentación" });
    expect(
      screen.queryByRole("button", { name: /El resumen de la IA/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(CASO.resumen)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Para la próxima/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Ajustar el precio.")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Lo que la IA no leyó (3)" }),
    );
    expect(
      screen.getByText(
        "BPM EVENTOS SPA: planilla.xlsx · la IA lee PDF, Word e imágenes",
      ),
    ).toBeInTheDocument();
  });

  it("una comparación de antes, o una licitación sin líneas: una sola tarjeta, sin «compites»", async () => {
    pintar({
      competencia: [archivo(31, "Oferta.pdf", "SOL DE QUILLON SPA")],
      trabajo: trabajoListo({
        ...CASO,
        lectura: undefined,
        lineas: [
          {
            nombre: "",
            tope: "",
            compites: true,
            que_lo_decide: "",
            ganador_probable: TEXTUM_L1.nombre,
            si_aceptan_todo: TEXTUM_L1.nombre,
            a_la_letra: VALLE.nombre,
            oferentes: [
              { ...VALLE, oferta: undefined, corto: undefined },
              { ...TEXTUM_L1, oferta: undefined, corto: undefined },
            ],
          },
        ],
      }),
    });
    const tarjeta = await screen.findByRole("article", {
      name: "La comparación",
    });
    expect(
      within(tarjeta).getByText("Cómo va la licitación"),
    ).toBeInTheDocument();
    expect(within(tarjeta).queryByText("Compites")).not.toBeInTheDocument();
    expect(within(tarjeta).queryByText(/^Tope/)).not.toBeInTheDocument();
    // Sin la frase de la IA, lo que decide es lo grave de quien va primero.
    expect(
      within(tarjeta).getByText("Lo que lo decide: La colación no ofrece café"),
    ).toBeInTheDocument();
    // Los archivos de la competencia que no calzan por nombre siguen a mano.
    expect(
      screen.getByRole("button", { name: /SOL DE QUILLON SPA/ }),
    ).toBeInTheDocument();
    // En una compra ágil el botón compara de nuevo.
    expect(
      screen.getByRole("button", { name: /Volver a comparar/ }),
    ).toBeEnabled();
  });
});

describe("Abajo, después de la resolución (decisión 128)", () => {
  const RECLAMOS = {
    corresponde: true,
    sin_adjudicar: null,
    comparada: true,
    adjudicada_el: "2026-11-20",
    reclamo_hasta: "2099-11-27",
    tribunal_hasta: "2099-12-02",
    maximo: 3500,
    reclamos: [
      {
        contra: "TEXTUM BURGOS Y ORTIZ LIMITADA",
        corto: "TEXTUM",
        linea: "Línea 1 · Alimentación",
        adjudicada: true,
        incumplimientos: 1,
        sin_lugar: 0,
        por_ausencia: false,
        texto: "Señores\nILUSTRE MUNICIPALIDAD DE QUILLON",
        caracteres: 1076,
      },
    ],
  };

  it("si pierdo sí: «Reclamos» va después de «Por qué perdiste» y antes de lo que aprendemos de la comisión", async () => {
    c.getReclamos.mockResolvedValue(RECLAMOS as never);
    pintar({
      esLicitacion: true,
      perdida: true,
      competencia: DE_LA_COMPETENCIA,
      trabajo: trabajoListo(),
    });
    const seccion = await screen.findByRole("region", { name: "Reclamos" });
    expect(c.getReclamos).toHaveBeenCalledWith(84);
    expect(
      within(seccion).getByRole("button", { name: /Generar reclamo/ }),
    ).toBeInTheDocument();
    const orden = [
      screen.getByRole("heading", { name: "Por qué perdiste" }),
      screen.getByRole("heading", { name: "Reclamos" }),
      screen.getByRole("heading", {
        name: /Lo que aprendemos de la comisión/,
      }),
    ];
    for (let i = 0; i < orden.length - 1; i++) {
      expect(
        orden[i].compareDocumentPosition(orden[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // En las tarjetas de las líneas sigue sin haber reclamo.
    expect(
      within(
        screen.getByRole("article", { name: "Línea 1 · Alimentación" }),
      ).queryByRole("button", { name: /reclamo/i }),
    ).not.toBeInTheDocument();
  });

  it("si gano no reclamo: ni sección ni «Por qué perdiste»", async () => {
    pintar({
      esLicitacion: true,
      competencia: DE_LA_COMPETENCIA,
      trabajo: trabajoListo(),
    });
    await screen.findByRole("article", { name: "Línea 1 · Alimentación" });
    expect(
      screen.queryByRole("region", { name: "Reclamos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Por qué perdiste" }),
    ).not.toBeInTheDocument();
    expect(c.getReclamos).not.toHaveBeenCalled();
    // Lo que aprendemos de la comisión sí está, gane o pierda.
    expect(
      screen.getByRole("heading", { name: /Lo que aprendemos de la comisión/ }),
    ).toBeInTheDocument();
  });
});
