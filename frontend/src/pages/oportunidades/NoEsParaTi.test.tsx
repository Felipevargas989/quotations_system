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
import * as servicio from "../../services/oportunidades.service";
import NoEsParaTi from "./NoEsParaTi";

// NO ES PARA TI (decisión 117, 04-11; Felipe: "rojo burdeo o un rojo vino
// tinto... y la letra clara"). Lo que fija: el aviso en burdeo con letra
// clara y dónde piden el servicio; «Desistir» abre el modal del porqué y
// descarta con el motivo; sin poder desistir, no hay botón.

vi.mock("../../services/oportunidades.service", () => ({
  actualizarOportunidad: vi.fn(),
}));
const s = vi.mocked(servicio);

const pintar = (puedeDesistir = true, lugar = "Salón en San Ignacio.") =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NoEsParaTi
        oportunidadId={40}
        lugar={lugar}
        puedeDesistir={puedeDesistir}
      />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("No es para ti (decisión 117)", () => {
  it("en burdeo y con letra clara, dice dónde piden el servicio", () => {
    pintar();
    const aviso = screen.getByText("No es para ti: las bases te dejan fuera.");
    expect(aviso).toHaveClass("text-white");
    expect(aviso.closest("div.bg-rose-900")).not.toBeNull();
    expect(
      screen.getByText("Piden otro lugar: Salón en San Ignacio."),
    ).toHaveClass("text-rose-100");
  });

  it("«Desistir» abre el porqué y descarta con el motivo elegido", async () => {
    s.actualizarOportunidad.mockResolvedValueOnce({} as never);
    pintar();
    fireEvent.click(
      screen.getByRole("button", { name: "Desistir de esta licitación" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Muy lejos" }));
    await waitFor(() =>
      expect(s.actualizarOportunidad).toHaveBeenCalledWith(40, {
        estado: "descartada",
        motivo: "muy_lejos",
      }),
    );
  });

  it("sin poder desistir no hay botón; sin lugar, solo el aviso", () => {
    pintar(false, "  ");
    expect(
      screen.getByText("No es para ti: las bases te dejan fuera."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Desistir de esta licitación" }),
    ).toBeNull();
    expect(screen.queryByText(/Piden otro lugar/)).toBeNull();
  });
});
