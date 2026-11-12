// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/lectura-sola.service";
import GastoDeLaLecturaSola from "./GastoDeLaLecturaSola";

// «BASES LEÍDAS SOLAS» (decisión 131, 12-11): lo que gastó la lectura sola de
// las bases, hoy y en 7 días, sin IA. El motor va de mentira.

vi.mock("../../services/lectura-sola.service", () => ({
  getLecturaSola: vi.fn(),
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <GastoDeLaLecturaSola />
    </QueryClientProvider>,
  );

describe("Bases leídas solas", () => {
  it("dice cuántas bases leyó solo el motor y cuánto costaron, hoy y en 7 días", async () => {
    s.getLecturaSola.mockResolvedValue({
      hoy: { bases: 9, usd: 4.86 },
      semana: { bases: 31, usd: 11.65 },
    });
    pintar();
    expect(await screen.findByText("Bases leídas solas")).toBeInTheDocument();
    const hoy = screen.getByText("Hoy").closest("tr");
    expect(hoy).toHaveTextContent("9");
    expect(hoy).toHaveTextContent("US$4,86");
    const semana = screen.getByText("7 días").closest("tr");
    expect(semana).toHaveTextContent("31");
    expect(semana).toHaveTextContent("US$11,65");
  });

  it("mientras no llega, o si falla, no muestra nada", async () => {
    s.getLecturaSola.mockRejectedValue(new Error("sin red"));
    const { container } = pintar();
    await new Promise((listo) => setTimeout(listo, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
