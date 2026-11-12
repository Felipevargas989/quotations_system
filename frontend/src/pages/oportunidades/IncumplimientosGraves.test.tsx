// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OferenteComparado } from "../../services/comparacion.service";
import IncumplimientosGraves from "./IncumplimientosGraves";

// LOS INCUMPLIMIENTOS GRAVES (decisión 59, 20-10): lo que deja fuera una
// oferta, con su prueba y su regla. Desde la decisión 125 es la columna «Lo
// puede dejar fuera» de cada oferta. Desde la 128 aquí no se reclama: el
// reclamo vive en `Reclamos`, abajo y solo en una perdida.

afterEach(() => {
  cleanup();
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
  ...o,
});

describe("Incumplimientos graves: «Lo puede dejar fuera»", () => {
  it("sin incumplimientos graves, o en una comparación de antes, la columna guarda su lugar", () => {
    for (const graves of [[], undefined]) {
      render(<IncumplimientosGraves oferente={oferente({ graves })} />);
      expect(screen.getByText("Lo puede dejar fuera")).toBeInTheDocument();
      expect(screen.getByText("Nada a la vista")).toBeInTheDocument();
      cleanup();
    }
  });

  it("cada uno con su prueba y su regla; si es porque algo no está, lo dice", () => {
    render(
      <IncumplimientosGraves oferente={oferente({ graves: [GRAVE, FALTA] })} />,
    );
    expect(screen.getByText(GRAVE.que)).toBeInTheDocument();
    expect(
      screen.getByText("Dónde se ve: Anexo 4-A, página 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Regla: Ley de Compras, art. 9"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Es porque no aparece entre lo que llegó de este oferente.",
      ),
    ).toHaveLength(1);
  });

  it("decisión 128: aquí no se reclama, ni en la oferta de un competidor ni en una comparación de antes que traía el texto", () => {
    render(
      <IncumplimientosGraves
        oferente={
          {
            ...oferente(),
            reclamo: "Señores\nFUNDACION INTEGRA\nPresente",
          } as OferenteComparado
        }
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Señores/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tribunal/)).not.toBeInTheDocument();
  });
});
