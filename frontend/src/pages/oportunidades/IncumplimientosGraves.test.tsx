// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OferenteComparado } from "../../services/comparacion.service";
import IncumplimientosGraves, {
  CENTRO_DE_AYUDA,
  Reclamo,
} from "./IncumplimientosGraves";

// LOS INCUMPLIMIENTOS GRAVES Y EL RECLAMO (decisión 59, 20-10). Felipe:
// "en caso de incumplimiento grave, genere un texto para hacer un reclamos
// en el centro de ayuda". Eventia no envía nada: el texto se copia. Desde la
// decisión 125 es la columna «Lo puede dejar fuera» de cada oferta.

vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GRAVE = {
  que: "Su encargada del servicio es la dueña de DeliBreak",
  prueba: "Anexo 4-A, página 1",
  regla: "Ley de Compras, art. 9",
  por_ausencia: false,
};
const FALTA = {
  que: "No presentó el Anexo N°7",
  prueba: "no está entre lo que presentó",
  regla: "Bases, punto V",
  por_ausencia: true,
};
const TEXTO = "Señores\nFUNDACION INTEGRA\nPresente";

const oferente = (o: Partial<OferenteComparado> = {}): OferenteComparado => ({
  nombre: "MYRNA DEL PINO",
  es_tuya: false,
  precio: "$2.500.041",
  cumple_bases: "no",
  por_que: "",
  notas: [],
  probabilidad: 30,
  fortalezas: [],
  debilidades: [],
  puntaje: 70,
  graves: [GRAVE],
  reclamo: TEXTO,
  ...o,
});

describe("Incumplimientos graves y el reclamo", () => {
  it("sin incumplimientos graves, o en una comparación de antes, la columna guarda su lugar y no ofrece reclamo", () => {
    for (const graves of [[], undefined]) {
      render(
        <IncumplimientosGraves
          oferente={oferente({ graves, reclamo: null })}
          adjudicada={false}
        />,
      );
      expect(screen.getByText("Lo puede dejar fuera")).toBeInTheDocument();
      expect(screen.getByText("Nada a la vista")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Redactar reclamo/ }),
      ).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("el reclamo solo: nada si el motor no armó uno (no compite contigo, o es tu oferta)", () => {
    const sin = render(
      <Reclamo oferente={oferente({ reclamo: null })} adjudicada={false} />,
    );
    expect(sin.container).toBeEmptyDOMElement();
    cleanup();
    render(
      <Reclamo oferente={oferente({ corto: "MYRNA" })} adjudicada={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Redactar reclamo/ }));
    // Se le dice por su nombre corto de «La competencia».
    expect(
      screen.getByLabelText("Reclamo sobre la oferta de MYRNA"),
    ).toHaveValue(TEXTO);
  });

  it("cada uno con su prueba y su regla; «Redactar reclamo» da el texto para copiar y el Centro de Ayuda", async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: escribir },
      configurable: true,
    });
    render(<IncumplimientosGraves oferente={oferente()} adjudicada={false} />);
    expect(screen.getByText(GRAVE.que)).toBeInTheDocument();
    expect(
      screen.getByText("Dónde se ve: Anexo 4-A, página 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Regla: Ley de Compras, art. 9"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Redactar reclamo/ }));
    expect(
      screen.getByLabelText("Reclamo sobre la oferta de MYRNA DEL PINO"),
    ).toHaveValue(TEXTO);
    expect(
      screen.getByRole("link", { name: /Abrir el Centro de Ayuda/ }),
    ).toHaveAttribute("href", CENTRO_DE_AYUDA);
    fireEvent.click(screen.getByRole("button", { name: /Copiar/ }));
    await waitFor(() => expect(escribir).toHaveBeenCalledWith(TEXTO));
  });

  it("si es porque algo no está, antes pregunta si está todo lo de ese oferente", () => {
    render(
      <IncumplimientosGraves
        oferente={oferente({ graves: [FALTA] })}
        adjudicada={false}
      />,
    );
    expect(
      screen.getByText(
        "Es porque no aparece entre lo que llegó de este oferente.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Redactar reclamo/ }));
    expect(
      screen.getByText("¿Está todo lo que presentó MYRNA DEL PINO?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(
      screen.getByText(
        /Trae o sube todo lo que presentó MYRNA DEL PINO y vuelve a comparar/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Reclamo sobre la oferta/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Redactar reclamo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, está todo" }));
    expect(
      screen.getByLabelText("Reclamo sobre la oferta de MYRNA DEL PINO"),
    ).toBeInTheDocument();
  });

  it("en tu oferta no hay reclamo; ya adjudicada, lo que queda es el Tribunal", () => {
    render(
      <IncumplimientosGraves
        oferente={oferente({ es_tuya: true })}
        adjudicada={false}
      />,
    );
    expect(screen.getByText(GRAVE.que)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Redactar reclamo/ }),
    ).not.toBeInTheDocument();
    cleanup();

    render(<IncumplimientosGraves oferente={oferente()} adjudicada />);
    expect(
      screen.queryByRole("button", { name: /Redactar reclamo/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /impugnar ante el Tribunal de Contratación Pública, dentro de 10 días hábiles/,
      ),
    ).toBeInTheDocument();
  });
});
