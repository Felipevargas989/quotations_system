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
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/pulseras.service";
import type { ResumenDePulseras } from "../../services/pulseras.service";
import Pulseras from "./Pulseras";

// LAS PULSERAS (doc 19 §9.49): las cuatro cifras, el movimiento, «Entregar
// pulseras» y lo vendido plegado abajo.

vi.mock("../../services/pulseras.service", () => ({
  getPulseras: vi.fn(),
  entregarPulseras: vi.fn(),
}));
vi.mock("./LoVendido", () => ({
  default: () => <p>la tabla de lo vendido</p>,
}));
const s = vi.mocked(servicio);

const RESUMEN: ResumenDePulseras = {
  usa_pulsera: true,
  entregadas: 150,
  vendidas: 27,
  deberian_quedar: 123,
  contadas: 120,
  contadas_en: "2026-11-18T23:00:00Z",
  diferencia: -3,
  ventas_directas: [{ created_at: "2026-11-18T02:00:00Z", pulseras: 6 }],
  turnos: [
    {
      id: 2,
      abierta_en: "2026-11-18T12:00:00Z",
      cerrada_en: "2026-11-18T23:00:00Z",
      abierta_por_nombre: "Ana",
      cerrada_por_nombre: "Ana",
      entregadas: 50,
      vendidas: 17,
      deberian: 121,
      contadas: 120,
      diferencia: -1,
    },
  ],
  entregas: [
    { id: 1, cantidad: 100, creada_en: "2026-11-17T11:00:00Z", por: "Pedro" },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Pulseras />
    </QueryClientProvider>,
  );

const cifra = (titulo: string) =>
  screen.getByText(titulo).parentElement as HTMLElement;

describe("la pestaña «Pulseras» (§9.49)", () => {
  it("las cuatro cifras, con «Faltan» en rojo, y el movimiento", async () => {
    s.getPulseras.mockResolvedValue(RESUMEN);
    abrir();
    await screen.findByText("Entregadas");
    expect(within(cifra("Entregadas")).getByText("150")).toBeInTheDocument();
    expect(within(cifra("Vendidas")).getByText("27")).toBeInTheDocument();
    expect(
      within(cifra("Deberían quedar")).getByText("123"),
    ).toBeInTheDocument();
    const faltan = within(cifra("Contadas")).getByText("Faltan 3");
    expect(faltan.className).toMatch(/bg-red-100/);
    expect(screen.getByText("+100")).toBeInTheDocument();
    expect(screen.getByText("Venta directa")).toBeInTheDocument();
    expect(screen.getByText("−6")).toBeInTheDocument();
    expect(screen.getByText("Turno de Ana")).toBeInTheDocument();
    expect(screen.getByText("120 de 121")).toBeInTheDocument();
    // Lo vendido por ítem, plegado abajo.
    expect(screen.getByText("Lo vendido por ítem")).toBeInTheDocument();
  });

  it("«Calza» en verde cuando lo contado es lo que debería quedar", async () => {
    s.getPulseras.mockResolvedValue({ ...RESUMEN, diferencia: 0 });
    abrir();
    const calza = await screen.findByText("Calza");
    expect(calza.className).toMatch(/bg-green-100/);
  });

  it("antes del primer conteo, «Contadas» va con raya y sin chip", async () => {
    s.getPulseras.mockResolvedValue({
      ...RESUMEN,
      contadas: null,
      contadas_en: null,
      diferencia: null,
      turnos: [],
    });
    abrir();
    await screen.findByText("Entregadas");
    expect(within(cifra("Contadas")).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/Faltan|Calza|Sobran/)).toBeNull();
  });

  it("una empresa sin ítems con pulsera: un estado vacío corto", async () => {
    s.getPulseras.mockResolvedValue({
      ...RESUMEN,
      usa_pulsera: false,
      entregadas: 0,
      entregas: [],
      turnos: [],
      ventas_directas: [],
    });
    abrir();
    expect(
      await screen.findByText(/Ningún ítem del tarifario usa pulsera/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Entregadas")).toBeNull();
    expect(screen.queryByRole("button", { name: /Entregar/ })).toBeNull();
  });

  it("«Entregar pulseras» anota cuántas", async () => {
    s.getPulseras.mockResolvedValue(RESUMEN);
    s.entregarPulseras.mockResolvedValue({ ...RESUMEN, entregadas: 250 });
    abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: "Entregar pulseras" }),
    );
    const entregar = screen.getByRole("button", { name: "Entregar" });
    expect(entregar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cuántas"), {
      target: { value: "100" },
    });
    fireEvent.click(entregar);
    await waitFor(() => expect(s.entregarPulseras).toHaveBeenCalledWith(100));
    expect(
      await within(cifra("Entregadas")).findByText("250"),
    ).toBeInTheDocument();
  });
});
