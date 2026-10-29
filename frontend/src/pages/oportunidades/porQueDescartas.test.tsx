// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, ToastHost } from "../../components/toast/Toast";
import { MOTIVOS_DEL_DESCARTE } from "../../services/decisiones";
import * as servicio from "../../services/oportunidades.service";
import { preguntarPorQue } from "./porQueDescartas";

// EL PORQUÉ DE UN DESCARTE (decisión 113): descartar sigue siendo un clic,
// y el aviso trae los motivos para que el semáforo aprenda. La tarjeta de
// aviso de la casa aprendió a llevar botones.

vi.mock("../../services/oportunidades.service", () => ({
  ponerMotivoDelDescarte: vi.fn(),
}));

afterEach(cleanup);

describe("La tarjeta de aviso con botones", () => {
  it("al apretar un botón, corre y la tarjeta se cierra", () => {
    const alHacer = vi.fn();
    render(<ToastHost />);
    act(() => {
      toast.success("¿Seguro?", { acciones: [{ etiqueta: "Sí", alHacer }] });
    });
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    expect(alHacer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("¿Seguro?")).not.toBeInTheDocument();
  });

  it("sin botones se ve como siempre", () => {
    render(<ToastHost />);
    act(() => {
      toast.success("Guardado");
    });
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1); // solo cerrar
  });
});

describe("Después de descartar, el porqué de un clic", () => {
  it("trae los cinco motivos y manda el elegido a esa oportunidad", async () => {
    vi.mocked(servicio.ponerMotivoDelDescarte).mockResolvedValue({
      motivo: "muy_lejos",
    });
    render(<ToastHost />);
    act(() => {
      preguntarPorQue(9, "Descartada.");
    });
    expect(
      screen.getByText("Descartada. ¿Por qué? Así el semáforo aprende."),
    ).toBeInTheDocument();
    for (const m of MOTIVOS_DEL_DESCARTE) {
      expect(
        screen.getByRole("button", { name: m.etiqueta }),
      ).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Muy lejos" }));
    expect(servicio.ponerMotivoDelDescarte).toHaveBeenCalledWith(
      9,
      "muy_lejos",
    );
    await waitFor(() =>
      expect(screen.getByText("Anotado: «Muy lejos».")).toBeInTheDocument(),
    );
  });
});
