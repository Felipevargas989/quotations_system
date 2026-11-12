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
import * as comparacion from "../../services/comparacion.service";
import type { ReclamosDeLaOportunidad } from "../../services/comparacion.service";
import Reclamos, { RECLAMOS_DE_MERCADO_PUBLICO } from "./Reclamos";

// LOS RECLAMOS, DESPUÉS DE LA RESOLUCIÓN (decisión 128, 11-11). Felipe: "el
// reclamo creo que debe ser post resolución, si gano no reclamo, si pierdo
// sí, y debería ser una sección abajo para generar reclamos". El texto lo
// arma el motor; Eventia no envía nada: se copia.

vi.mock("../../services/comparacion.service", () => ({
  getReclamos: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
// Hoy es el 24-11-2026: el reclamo vence el 27 y el Tribunal el 02-12.
vi.mock("../../utils/dates", () => ({ hoyEnChile: () => "2026-11-24" }));
const c = vi.mocked(comparacion);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TEXTO =
  "Señores\nILUSTRE MUNICIPALIDAD DE QUILLON\n\nReclamo por la adjudicación de la licitación 5040-14-LE26.";

const reclamo = (
  de: Partial<ReclamosDeLaOportunidad["reclamos"][number]> = {},
) => ({
  contra: "TEXTUM BURGOS Y ORTIZ LIMITADA",
  corto: "TEXTUM",
  linea: "Línea 1 · Alimentación",
  adjudicada: true,
  incumplimientos: 2,
  sin_lugar: 0,
  por_ausencia: false,
  texto: TEXTO,
  caracteres: 2140,
  ...de,
});

const respuesta = (
  de: Partial<ReclamosDeLaOportunidad> = {},
): ReclamosDeLaOportunidad => ({
  corresponde: true,
  sin_adjudicar: null,
  comparada: true,
  adjudicada_el: "2026-11-20",
  reclamo_hasta: "2026-11-27",
  tribunal_hasta: "2026-12-02",
  maximo: 3500,
  reclamos: [reclamo()],
  ...de,
});

const pintar = (r: ReclamosDeLaOportunidad) => {
  c.getReclamos.mockResolvedValue(r);
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Reclamos oportunidadId={4633} comparacionId={134} />
    </QueryClientProvider>,
  );
};

describe("Reclamos: solo si se perdió", () => {
  it("si gano no reclamo, y antes de la resolución tampoco: la sección no existe", async () => {
    const { container } = pintar(
      respuesta({ corresponde: false, reclamos: [] }),
    );
    await waitFor(() => expect(c.getReclamos).toHaveBeenCalledWith(4633));
    expect(container).toBeEmptyDOMElement();
  });

  it("a quién se adjudicó y cuántos incumplimientos, con los dos plazos; «Generar reclamo» da el texto, lo que ocupa y adónde llevarlo", async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: escribir },
      configurable: true,
    });
    pintar(respuesta());
    expect(
      await screen.findByRole("heading", { name: "Reclamos" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText("TEXTUM")
        .closest("p")
        ?.textContent?.replace(/\s+/g, " "),
    ).toBe("TEXTUM se adjudicó la Línea 1 · Alimentación · 2 incumplimientos");
    expect(screen.getByText("Reclamo: hasta el 27-11")).toBeInTheDocument();
    expect(screen.getByText("Tribunal: hasta el 02-12")).toBeInTheDocument();
    // El texto no se ve hasta pedirlo.
    expect(
      screen.queryByLabelText(/Reclamo sobre la oferta/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Generar reclamo/ }));
    expect(
      screen.getByLabelText("Reclamo sobre la oferta de TEXTUM"),
    ).toHaveValue(TEXTO);
    expect(screen.getByText("2.140 de 3.500 caracteres")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ir a reclamos de Mercado Público/ }),
    ).toHaveAttribute("href", RECLAMOS_DE_MERCADO_PUBLICO);
    expect(
      screen.getByText(/lo encontró la IA. Eventia no envía nada/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Copiar/ }));
    await waitFor(() => expect(escribir).toHaveBeenCalledWith(TEXTO));
  });

  it("un plazo que ya pasó se dice vencido; sin fecha de adjudicación, no se inventa", async () => {
    pintar(
      respuesta({ reclamo_hasta: "2026-11-20", tribunal_hasta: "2026-11-24" }),
    );
    expect(
      await screen.findByText("Reclamo: venció el 20-11"),
    ).toBeInTheDocument();
    // El mismo día todavía se puede.
    expect(screen.getByText("Tribunal: hasta el 24-11")).toBeInTheDocument();
    cleanup();
    pintar(respuesta({ reclamo_hasta: null, tribunal_hasta: null }));
    await screen.findByRole("heading", { name: "Reclamos" });
    expect(screen.queryByText(/hasta el|venció/)).not.toBeInTheDocument();
  });

  it("si algo es porque «no está», antes pregunta si está todo lo de ese oferente", async () => {
    pintar(respuesta({ reclamos: [reclamo({ por_ausencia: true })] }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Generar reclamo/ }),
    );
    expect(
      screen.getByText("¿Está todo lo que presentó TEXTUM?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(
      screen.getByText(
        /Trae o sube todo lo que presentó TEXTUM y vuelve a comparar/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Reclamo sobre la oferta/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generar reclamo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, está todo" }));
    expect(
      screen.getByLabelText("Reclamo sobre la oferta de TEXTUM"),
    ).toBeInTheDocument();
  });

  it("lo que no cupo en los 3.500 caracteres queda dicho; sin líneas no se nombra la línea; sin saber a quién se adjudicó, tampoco", async () => {
    pintar(
      respuesta({
        reclamos: [
          reclamo({
            linea: "",
            adjudicada: false,
            incumplimientos: 3,
            sin_lugar: 2,
            caracteres: 3480,
          }),
        ],
      }),
    );
    expect(
      (await screen.findByText("TEXTUM"))
        .closest("p")
        ?.textContent?.replace(/\s+/g, " "),
    ).toBe("TEXTUM · 5 incumplimientos");
    fireEvent.click(screen.getByRole("button", { name: /Generar reclamo/ }));
    expect(
      screen.getByText(
        "3.480 de 3.500 caracteres · 2 incumplimientos no cupieron",
      ),
    ).toBeInTheDocument();
  });

  it("a la adjudicada sin nada en contra no se le arma reclamo; y sin comparación, sin adjudicar o sin incumplimientos, lo dice", async () => {
    pintar(
      respuesta({
        reclamos: [reclamo({ texto: null, incumplimientos: 0, caracteres: 0 })],
      }),
    );
    expect(
      (await screen.findByText("TEXTUM"))
        .closest("p")
        ?.textContent?.replace(/\s+/g, " "),
    ).toBe(
      "TEXTUM se adjudicó la Línea 1 · Alimentación · sin incumplimientos a la vista",
    );
    expect(
      screen.queryByRole("button", { name: /Generar reclamo/ }),
    ).not.toBeInTheDocument();
    cleanup();

    pintar(respuesta({ comparada: false, reclamos: [] }));
    expect(
      await screen.findByText(/Compara las ofertas primero/),
    ).toBeInTheDocument();
    cleanup();

    pintar(respuesta({ sin_adjudicar: "desierta", reclamos: [] }));
    expect(
      await screen.findByText(
        /Quedó desierta: no hay oferta adjudicada a la que reclamarle/,
      ),
    ).toBeInTheDocument();
    cleanup();

    pintar(respuesta({ reclamos: [] }));
    expect(
      await screen.findByText(
        /La comparación no encontró incumplimientos en las ofertas que compiten contigo/,
      ),
    ).toBeInTheDocument();
  });
});
