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
import * as boletas from "../../services/boletas.service";
import TarifarioDeBoletas from "./TarifarioDeBoletas";

// EL TARIFARIO: el interruptor «Usa pulsera» de cada ítem (doc 19 §9.49).

vi.mock("../../services/boletas.service", () => ({
  getTarifario: vi.fn(),
  crearItemDelTarifario: vi.fn(),
  editarItemDelTarifario: vi.fn(),
  borrarItemDelTarifario: vi.fn(),
}));
const b = vi.mocked(boletas);

const ITEM = {
  id: 26,
  nombre: "Ticket diario, temporada media",
  precio: 7500,
  unidad: "persona",
  activo: true,
  orden: 0,
  usa_pulsera: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("el tarifario (§9.49)", () => {
  it("«Usa pulsera» es un interruptor por ítem que se guarda al tocarlo", async () => {
    b.getTarifario.mockResolvedValue([ITEM]);
    b.editarItemDelTarifario.mockResolvedValue([
      { ...ITEM, usa_pulsera: true },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TarifarioDeBoletas />
      </QueryClientProvider>,
    );
    const interruptor = await screen.findByRole("switch", {
      name: "Usa pulsera: Ticket diario, temporada media",
    });
    expect(interruptor).toHaveAttribute("aria-checked", "false");
    fireEvent.click(interruptor);
    await waitFor(() =>
      expect(b.editarItemDelTarifario).toHaveBeenCalledWith(26, {
        usa_pulsera: true,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("switch", {
          name: "Usa pulsera: Ticket diario, temporada media",
        }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });
});
