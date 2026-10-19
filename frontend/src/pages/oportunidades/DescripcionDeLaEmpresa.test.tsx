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
import DescripcionDeLaEmpresa from "./DescripcionDeLaEmpresa";

// LO QUE VENDE LA EMPRESA, EN «MI EMPRESA» (decisión 30, 19-10): una sola
// descripción; al guardarla no se tocan regiones ni comunas.

vi.mock("../../services/oportunidades.service", () => ({
  getConfigOportunidades: vi.fn(),
  guardarConfigOportunidades: vi.fn(),
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CONFIG = {
  regiones: ["Ñuble", "Biobío"],
  comunas_cercanas: ["Quillón", "Bulnes"],
  perfil: "Valle del Sol vende eventos y alojamiento.",
  umbral_alto_valor: 3_000_000,
  correo_avisos: "contacto@valledelsolquillon.cl",
};

describe("Lo que vende tu empresa", () => {
  it("muestra la descripción y la guarda sin tocar regiones ni comunas", async () => {
    s.getConfigOportunidades.mockResolvedValue(CONFIG as never);
    s.guardarConfigOportunidades.mockResolvedValue(CONFIG as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DescripcionDeLaEmpresa />
      </QueryClientProvider>,
    );
    const campo = await screen.findByLabelText("Lo que vende tu empresa");
    await waitFor(() => expect(campo).toHaveValue(CONFIG.perfil));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.change(campo, {
      target: {
        value: "Valle del Sol vende eventos, alojamiento y almuerzos.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(s.guardarConfigOportunidades).toHaveBeenCalledWith({
        regiones: ["Ñuble", "Biobío"],
        comunas_cercanas: ["Quillón", "Bulnes"],
        perfil: "Valle del Sol vende eventos, alojamiento y almuerzos.",
      }),
    );
  });
});
