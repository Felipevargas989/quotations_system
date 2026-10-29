// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTIVOS_DEL_DESCARTE } from "../../services/decisiones";
import PorQueDescartas from "./PorQueDescartas";

// EL PORQUÉ DE UN DESCARTE (decisión 113): el modal que se abre al apretar
// «Descartar». Elegir un motivo descarta y lo anota; también se puede
// descartar sin motivo o cancelar.

afterEach(cleanup);

describe("El modal del porqué al descartar", () => {
  it("pregunta por qué, con los cinco motivos", () => {
    render(<PorQueDescartas onElegir={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.getByText("¿Por qué la descartas?")).toBeInTheDocument();
    expect(screen.getByText("Así el semáforo aprende.")).toBeInTheDocument();
    for (const m of MOTIVOS_DEL_DESCARTE) {
      expect(
        screen.getByRole("button", { name: m.etiqueta }),
      ).toBeInTheDocument();
    }
  });

  it("elegir un motivo lo manda; sin motivo manda null; cancelar no descarta", () => {
    const onElegir = vi.fn();
    const onCancelar = vi.fn();
    render(<PorQueDescartas onElegir={onElegir} onCancelar={onCancelar} />);
    fireEvent.click(screen.getByRole("button", { name: "Muy lejos" }));
    expect(onElegir).toHaveBeenLastCalledWith("muy_lejos");
    fireEvent.click(
      screen.getByRole("button", { name: "Descartar sin motivo" }),
    );
    expect(onElegir).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onElegir).toHaveBeenCalledTimes(2);
  });

  it("al desistir, dice desistir", () => {
    render(
      <PorQueDescartas
        titulo="¿Por qué desistes?"
        sinMotivo="Desistir sin motivo"
        onElegir={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );
    expect(screen.getByText("¿Por qué desistes?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Desistir sin motivo" }),
    ).toBeInTheDocument();
  });
});
