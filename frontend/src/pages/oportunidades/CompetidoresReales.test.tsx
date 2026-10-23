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
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/competencia.service";
import type {
  CompetidorReal,
  EstadoDeLaCompetencia,
} from "../../services/competencia.service";
import CompetidoresReales from "./CompetidoresReales";

// «TUS COMPETIDORES» (decisiones 70 y 71, 22 y 23-10). Felipe: "mis
// competidores son esos": los que ofertaron donde ofertó, con lo que hacen
// en su zona; "la lectura de actas debería ser automática y debería ser un
// dato que me lo entregara, no algo cliqueable".

vi.mock("../../services/competencia.service", () => ({
  getCompetencia: vi.fn(),
  marcarCompetidor: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const competidor = (
  rut: string,
  nombre: string,
  extra: Partial<CompetidorReal> = {},
): CompetidorReal => ({
  rut,
  nombre,
  etiquetas: ["compitio"],
  encuentros: 1,
  te_gano: 1,
  ganaste: 0,
  diferencia_de_precio: 20.7,
  lineas_comparadas: 1,
  participaciones: 5,
  ganadas: 4,
  monto_ganado: 31_115_077,
  ultima: "2025-10-03",
  comprador_principal: { nombre: "ILUSTRE MUNICIPALIDAD DE QUILLON", veces: 3 },
  seguido: false,
  descartado: false,
  ...extra,
});

const estado = (
  competidores: CompetidorReal[],
  extra: Partial<EstadoDeLaCompetencia> = {},
): EstadoDeLaCompetencia => ({
  competidores,
  rut_empresa: "77701305-K",
  actas: { leidas: 89, total: 5977, leyendo: false },
  ...extra,
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <CompetidoresReales />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const SOL = competidor("77067895-1", "CENTRO TURISTICO SOL DE QUILLON SPA");
const PAN = competidor("76214886-2", "SOCIEDAD COMERCIAL CENTROPAN LTDA.", {
  te_gano: 0,
  diferencia_de_precio: null,
  lineas_comparadas: 0,
  participaciones: 1,
  ganadas: 0,
  monto_ganado: 0,
  comprador_principal: null,
});

describe("Tus competidores", () => {
  it("con quién compitió, quién ganó, el precio solo en las líneas comparables y lo que hace en la zona", async () => {
    s.getCompetencia.mockResolvedValue(estado([SOL, PAN]));
    pintar();
    const sol = (
      await screen.findByText("CENTRO TURISTICO SOL DE QUILLON SPA")
    ).closest("li")!;
    expect(within(sol).getByText("Compitió contigo")).toBeInTheDocument();
    expect(
      within(sol).getByText(
        "Se cruzaron 1 vez · ganó él 1 · ganaste tú 0 · Su precio: 20,7 % más caro que el tuyo",
      ),
    ).toBeInTheDocument();
    expect(
      within(sol).getByText(
        /^En tu zona: participó 5 veces, ganó 4 \(\$\s?31\.115\.077\) · más con ILUSTRE MUNICIPALIDAD DE QUILLON$/,
      ),
    ).toBeInTheDocument();
    const pan = screen
      .getByText("SOCIEDAD COMERCIAL CENTROPAN LTDA.")
      .closest("li")!;
    expect(
      within(pan).getByText(
        /Ofertaron líneas distintas: no se compara el precio/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Parecido/)).not.toBeInTheDocument();
  });

  it("sin botón: dice cuántas actas de la zona van leídas", async () => {
    s.getCompetencia.mockResolvedValue(
      estado([SOL], { actas: { leidas: 89, total: 5977, leyendo: true } }),
    );
    pintar();
    expect(
      await screen.findByText(
        "Actas leídas: 89 de 5.977 de tu zona · leyendo ahora.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Buscar en las actas/ }),
    ).not.toBeInTheDocument();
  });

  it("sin nadie todavía: las actas se están leyendo solas", async () => {
    s.getCompetencia.mockResolvedValue(estado([]));
    pintar();
    expect(
      await screen.findByText(/las actas de tu zona se están leyendo solas/),
    ).toBeInTheDocument();
  });

  it("«No es mi competidor» pregunta antes, lo saca y se recupera desde su botón", async () => {
    s.getCompetencia.mockResolvedValue(estado([SOL, PAN]));
    s.marcarCompetidor.mockImplementation((rut, cambios) =>
      Promise.resolve({
        rut,
        nombre: null,
        seguido: false,
        descartado: Boolean(cambios.descartado),
      }),
    );
    pintar();
    const pan = (
      await screen.findByText("SOCIEDAD COMERCIAL CENTROPAN LTDA.")
    ).closest("li")!;
    fireEvent.click(within(pan).getByText("No es mi competidor"));
    expect(s.marcarCompetidor).not.toHaveBeenCalled();
    fireEvent.click(within(pan).getByRole("button", { name: "Sí, sacar" }));
    await waitFor(() =>
      expect(
        screen.queryByText("SOCIEDAD COMERCIAL CENTROPAN LTDA."),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "No son competidores (1)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    await waitFor(() =>
      expect(s.marcarCompetidor).toHaveBeenLastCalledWith("76214886-2", {
        descartado: false,
      }),
    );
  });

  it("«Seguir» lo marca y queda con «Lo sigues»; las vistas son Todos y Los sigues", async () => {
    s.getCompetencia.mockResolvedValue(estado([SOL]));
    s.marcarCompetidor.mockResolvedValue({
      rut: "77067895-1",
      nombre: null,
      seguido: true,
      descartado: false,
    });
    pintar();
    const sol = (
      await screen.findByText("CENTRO TURISTICO SOL DE QUILLON SPA")
    ).closest("li")!;
    expect(
      screen.getByRole("button", { name: "Todos (1)" }),
    ).toBeInTheDocument();
    fireEvent.click(within(sol).getByRole("button", { name: "Seguir" }));
    expect(await within(sol).findByText("Lo sigues")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Los sigues (1)" }),
    ).toBeInTheDocument();
  });

  it("sin el RUT de la empresa, avisa que falta en «Mi empresa»", async () => {
    s.getCompetencia.mockResolvedValue(estado([], { rut_empresa: null }));
    pintar();
    expect(
      await screen.findByText(/Falta el RUT de tu empresa en «Mi empresa»/),
    ).toBeInTheDocument();
  });
});
