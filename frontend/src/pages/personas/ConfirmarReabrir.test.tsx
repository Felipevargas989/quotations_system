// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/people.service";
import ConfirmarReabrir from "./ConfirmarReabrir";

// LA PROPINA NO SE DESHACE A MEDIAS (doc 10 §14, 19-11-2026): reabrir
// dice cuánta propina repartida hay adentro antes de confirmar.

vi.mock("../../services/people.service", () => ({
  avisoDeReabrir: vi.fn(),
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = () => {
  const onYes = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfirmarReabrir
        origen={{ day: "2026-11-14" }}
        pregunta="¿Devolver Staff · 14-11 a Liquidación?"
        onYes={onYes}
        onNo={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onYes;
};

describe("ConfirmarReabrir", () => {
  it("con propina repartida, dice cuánto, entre cuántos y qué pasa", async () => {
    s.avisoDeReabrir.mockResolvedValue({
      monto: 20000,
      personas: 5,
      en_nomina: false,
    });
    const onYes = pintar();
    expect(
      await screen.findByText(/repartida entre 5 personas: queda escrita/),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$20\.000/)).toBeInTheDocument();
    expect(s.avisoDeReabrir).toHaveBeenCalledWith({ day: "2026-11-14" });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    expect(onYes).toHaveBeenCalled();
  });

  it("sin propina adentro, solo la pregunta de siempre", async () => {
    s.avisoDeReabrir.mockResolvedValue({
      monto: 0,
      personas: 0,
      en_nomina: false,
    });
    pintar();
    expect(
      await screen.findByText("¿Devolver Staff · 14-11 a Liquidación?"),
    ).toBeInTheDocument();
  });

  it("mientras lee el aviso, «Reabrir» espera", () => {
    s.avisoDeReabrir.mockReturnValue(new Promise(() => {}));
    pintar();
    expect(screen.getByText("Revisando la propina…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "…" })).toBeDisabled();
  });
});
