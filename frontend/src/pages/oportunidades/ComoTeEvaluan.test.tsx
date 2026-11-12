// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as experienciaServicio from "../../services/experiencia.service";
import * as postulacionServicio from "../../services/postulacion.service";
import * as servicio from "../../services/oportunidades.service";
import AnalisisDeBases from "./AnalisisDeBases";

// «CÓMO TE EVALÚAN» CUANDO EL PESO CAMBIA POR LÍNEA (decisión 130 del doc
// 17, 11-11). En la 1043030-9-LE26, de nueve líneas, la IA escribió el peso
// de todas en el mismo campo y la columna lo partía en veinte renglones.
// Felipe: "mira cómo quedó esto". Va en un archivo propio porque
// AnalisisYValidacion.test.tsx está al borde de las 800 líneas. Los
// servicios van de mentira.

vi.mock("../../services/preguntas.service", () => ({
  getPreguntas: vi.fn().mockResolvedValue([]),
  preguntar: vi.fn(),
}));
vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  getAnalisis: vi.fn(),
  pedirAnalisis: vi.fn(),
  getValidacion: vi.fn(),
  pedirValidacion: vi.fn(),
  getGeneraciones: vi.fn(),
  getCotizacionDeLaPostulacion: vi.fn(),
  getOferente: vi.fn(),
  actualizarOportunidad: vi.fn(),
}));
vi.mock("../../services/exigencias.service", () => ({
  marcarExigencia: vi.fn(),
}));
vi.mock("../../services/postulacion.service", () => ({
  getOfertaDeLaPostulacion: vi.fn(),
}));
vi.mock("../../services/experiencia.service", () => ({
  getExperiencia: vi.fn(),
}));

const s = vi.mocked(servicio);
const po = vi.mocked(postulacionServicio);
const xp = vi.mocked(experienciaServicio);

const DE_LAS_OTRAS =
  "en Línea 6 (también L2, L7, L8 y L9); 45% en L1, L3 y L4; 50% en L5";

/** Los criterios, como los dejó la IA: desordenados y con el peso de todas
 *  las líneas en los que cambian. */
const CRITERIOS = [
  { nombre: "C4. Requisitos formales", peso: "10%", como_se_evalua: "" },
  { nombre: "C1. Precio", peso: `35% ${DE_LAS_OTRAS}`, como_se_evalua: "" },
  {
    nombre: "C2. Experiencia del oferente",
    peso: "25% en Línea 6 (L2, L8 y L9); 30% L7; 35% L4 y L5; 40% L1 y L3",
    como_se_evalua: "",
  },
];

const ANALISIS = {
  id: 117,
  estado: "listo",
  resultado: {
    resumen: "Nueve líneas de servicios para jornadas de capacitación.",
    fechas: [],
    criterios: CRITERIOS,
    requisitos: [],
    garantias: [],
    te_dejan_fuera: [],
    condiciones: [],
  },
  archivos: [{ id: 1, nombre: "Bases.pdf" }],
  no_leidos: [],
  modelo: "claude-opus-5-5",
  tokens_entrada: 100_000,
  tokens_salida: 5_000,
  costo_usd: 0.5,
  error: null,
  creado_en: "2026-11-11T18:52:00.000Z",
  terminado_en: "2026-11-11T18:54:00.000Z",
};

const FICHA = {
  estado: "en_estudio",
  exigencias_marcadas: {},
  proceso: { fecha_cierre: "2026-11-20T19:00:00.000Z" },
} as unknown as Parameters<typeof AnalisisDeBases>[0]["ficha"];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = () => {
  s.getAnalisis.mockResolvedValue(ANALISIS as never);
  s.getValidacion.mockResolvedValue(null as never);
  s.getGeneraciones.mockResolvedValue({
    anexos: null,
    firma: null,
    propuesta: null,
  } as never);
  s.getCotizacionDeLaPostulacion.mockResolvedValue(null as never);
  s.getAdjuntos.mockResolvedValue([] as never);
  s.getOferente.mockResolvedValue({ documentos: [] } as never);
  po.getOfertaDeLaPostulacion.mockResolvedValue(null as never);
  xp.getExperiencia.mockResolvedValue({ piden: false, trabajo: null });
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AnalisisDeBases oportunidadId={13687} ficha={FICHA} />
    </QueryClientProvider>,
  );
};

describe("Cómo te evalúan, con el peso que cambia por línea", () => {
  it("en la columna va solo el peso con que parte, sin partirse, y lo de las otras líneas baja a una línea chica", async () => {
    pintar();
    const titulo = await screen.findByText("Cómo te evalúan");
    const bloque = titulo.closest("section") as HTMLElement;
    const filas = within(bloque).getAllByRole("listitem");
    // Siguen de más peso a menos, por el peso con que parte cada uno.
    expect(filas.map((li) => li.querySelector("span")?.textContent)).toEqual([
      "C1. Precio",
      "C2. Experiencia del oferente",
      "C4. Requisitos formales",
    ]);
    // En la columna, solo «35%», en negrita y en una línea; la barra, de 35.
    expect(within(filas[0]).getByText("35%")).toHaveClass(
      "font-bold",
      "whitespace-nowrap",
    );
    expect(filas[0].querySelector(".bg-blue-600")).toHaveStyle({
      width: "35%",
    });
    // Lo de las otras líneas, completo, en su línea chica de abajo.
    expect(within(filas[0]).getByText(DE_LAS_OTRAS)).toHaveClass(
      "col-span-full",
      "text-xs",
    );
    expect(within(filas[1]).getByText("25%")).toBeInTheDocument();
    expect(
      within(filas[1]).getByText(
        "en Línea 6 (L2, L8 y L9); 30% L7; 35% L4 y L5; 40% L1 y L3",
      ),
    ).toBeInTheDocument();
  });

  it("un peso corto queda como siempre: su número y sin línea de abajo", async () => {
    pintar();
    const titulo = await screen.findByText("Cómo te evalúan");
    const bloque = titulo.closest("section") as HTMLElement;
    const formales = within(bloque).getAllByRole("listitem")[2];
    expect(within(formales).getByText("10%")).toHaveClass("font-bold");
    expect(formales.querySelector(".col-span-full")).toBeNull();
    expect(formales.querySelector(".bg-blue-600")).toHaveStyle({
      width: "10%",
    });
  });
});
