// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as caja from "../../services/caja.service";
import LoVendido from "./LoVendido";

// LO VENDIDO (doc 19 §9.43, sprint 3): lo del tarifario del período por
// ítem, con su unidad, y por persona.

vi.mock("../../services/caja.service", () => ({
  getLoVendido: vi.fn(),
}));
const c = vi.mocked(caja);

beforeEach(() => {
  c.getLoVendido.mockResolvedValue({
    desde: "2026-11-01",
    hasta: "2026-11-09",
    personas: ["Ana", "Pedro"],
    items: [
      {
        tarifario_id: 26,
        nombre: "Ticket diario, temporada media",
        unidad: "persona",
        cantidad: 142,
        monto: 1065000,
      },
      {
        tarifario_id: 5,
        nombre: "Cabaña 4 personas, temporada media",
        unidad: "noche",
        cantidad: 1,
        monto: 100000,
      },
      {
        tarifario_id: 22,
        nombre: "Tinaja con tabla y espumante",
        unidad: "unidad",
        cantidad: 11,
        monto: 330000,
      },
    ],
    total: 1495000,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("lo vendido (§9.43)", () => {
  it("por ítem con su unidad, el total, y por persona", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LoVendido />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("142 personas")).toBeInTheDocument();
    expect(screen.getByText("1 noche")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("$1.495.000")).toBeInTheDocument();
    // Este mes, sin persona.
    expect(c.getLoVendido).toHaveBeenCalledWith(
      expect.objectContaining({ persona: null }),
    );
    const desde = c.getLoVendido.mock.calls[0][0].desde;
    expect(desde).toMatch(/^\d{4}-\d{2}-01$/);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Persona" })).getByRole(
        "button",
        { name: /Todas/ },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Ana/ }));
    await waitFor(() =>
      expect(c.getLoVendido).toHaveBeenLastCalledWith(
        expect.objectContaining({ persona: "Ana" }),
      ),
    );
  });
});
