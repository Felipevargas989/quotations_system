// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResultadosDeIA from "./ResultadosDeIA";

// Lo que armó la IA en Requerimientos (17-10-2026): cada una con su
// enlace al cotizador para revisarla antes de enviarla, y las que fallaron
// con su motivo. Sin nada que mostrar, no ocupa espacio.

afterEach(cleanup);

const pintar = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("ResultadosDeIA", () => {
  it("sin armadas ni fallidas, no se dibuja", () => {
    const { container } = pintar(
      <ResultadosDeIA armadas={[]} fallidas={[]} onCerrar={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("cada armada lleva al cotizador, y la fallida dice por qué", () => {
    pintar(
      <ResultadosDeIA
        armadas={[{ id: "q476", numero: 476, total: 1_951_600 }]}
        fallidas={[
          {
            id: "q470",
            numero: 470,
            motivo: "La IA no está disponible ahora.",
          },
        ]}
        onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByText(/N° 476 · \$1\.951\.600/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Abrir en el cotizador/ }),
    ).toHaveAttribute("href", "/quotation-form/q476");
    expect(
      screen.getByText(/N° 470: La IA no está disponible ahora\./),
    ).toBeInTheDocument();
  });
});
