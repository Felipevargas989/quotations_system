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
import * as servicio from "../../services/seViene.service";
import type { SeViene } from "../../services/seViene.service";
import SeVieneOportunidades from "./SeVieneOportunidades";

// «SE VIENE» CON EL SEMÁFORO DE LA BANDEJA (decisión 62, 20-10). Felipe:
// "deberíamos filtrar con el mismo semáforo, no tiene sentido analizar 400
// opciones".

vi.mock("../../services/seViene.service", () => ({
  getCalendario: vi.fn(),
  getLecturaDelCalendario: vi.fn(),
  descartarSerie: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./Ganadores", () => ({ default: () => null }));
const s = vi.mocked(servicio);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const serie = (
  codigo: string,
  nombre: string,
  semaforo: SeViene["semaforo"],
  extra: Partial<SeViene> = {},
): SeViene => ({
  nombre,
  organismo: "ILUSTRE MUNICIPALIDAD DE QUILLON",
  comuna: "Quillón",
  region: "Región del Ñuble",
  esperada: "2026-11-10T12:00:00.000Z",
  atrasada: false,
  anios: [2025],
  comuna_cercana: false,
  alto_valor: false,
  ultima: {
    codigo,
    fecha_publicacion: "2025-11-10T12:00:00.000Z",
    monto: 17_000_000,
    oferentes: 1,
    ganadores: [],
  },
  semaforo,
  razon: semaforo ? `Razón de ${nombre}.` : null,
  repite: semaforo ? false : null,
  repeticion: null,
  descartada: false,
  ...extra,
});

const pintar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SeVieneOportunidades />
    </QueryClientProvider>,
  );

describe("Se viene con el semáforo", () => {
  it("se ven las verdes y amarillas; las rojas solo si se piden", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde", {
        comuna_cercana: true,
        alto_valor: true,
      }),
      serie("1057432-59-LE25", "Servicio de coffee break", "amarillo"),
      serie("2410-147-L125", "Insumos para procedimientos", "rojo"),
    ]);
    pintar();
    expect(
      await screen.findByText("Día de campo del dirigente"),
    ).toBeInTheDocument();
    expect(screen.getByText("Servicio de coffee break")).toBeInTheDocument();
    expect(
      screen.queryByText("Insumos para procedimientos"),
    ).not.toBeInTheDocument();
    // La razón de la IA y la prioridad en violeta, sin el amarillo.
    expect(
      screen.getByText("Razón de Día de campo del dirigente."),
    ).toBeInTheDocument();
    expect(screen.getByText("Comuna cercana")).toHaveClass("bg-violet-50");
    expect(screen.queryByText("Prioridad")).not.toBeInTheDocument();
    // Nada que leer: no pregunta cómo va.
    expect(s.getLecturaDelCalendario).not.toHaveBeenCalled();

    // El filtro de la bandeja: cada color con cuántas hay; el reciclaje,
    // prendido como el verde y el amarillo, y la basura sin botón: los
    // insumos solo aparecen al buscarlos (decisión 72, 23-10).
    expect(screen.getByRole("button", { name: /Verdes 1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Reciclaje 0" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: /Basura/ })).toBeNull();
    fireEvent.change(
      screen.getByPlaceholderText("Buscar nombre, organismo o código"),
      { target: { value: "insumos" } },
    );
    expect(screen.getByText("Insumos para procedimientos")).toBeInTheDocument();

    // El buscador: nombre, organismo o código.
    fireEvent.change(
      screen.getByPlaceholderText("Buscar nombre, organismo o código"),
      { target: { value: "coffee" } },
    );
    expect(screen.getByText("Servicio de coffee break")).toBeInTheDocument();
    expect(
      screen.queryByText("Día de campo del dirigente"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Verdes 0/ }),
    ).toBeInTheDocument();
  });

  it("mientras la IA lee, lo sin leer no se ve y dice cómo va", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde"),
      serie("2410-147-L125", "Insumos para procedimientos", null),
    ]);
    s.getLecturaDelCalendario.mockResolvedValue({
      leyendo: true,
      leidas: 3,
      total: 10,
    });
    pintar();
    expect(await screen.findByText(/van 3 de 10/)).toBeInTheDocument();
    expect(
      screen.queryByText("Insumos para procedimientos"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Día de campo del dirigente")).toBeInTheDocument();
  });

  it("al terminar de leer pide el calendario otra vez, y lo que quedó sin leer se ve sin color", async () => {
    s.getCalendario
      .mockResolvedValueOnce([
        serie("2410-147-L125", "Insumos para procedimientos", null),
        serie("5040-25-LE25", "Día de campo del dirigente", null),
      ])
      .mockResolvedValue([
        serie("2410-147-L125", "Insumos para procedimientos", null),
        serie("5040-25-LE25", "Día de campo del dirigente", "verde"),
      ]);
    s.getLecturaDelCalendario
      .mockResolvedValueOnce({ leyendo: true, leidas: 1, total: 2 })
      .mockResolvedValue({ leyendo: false, leidas: 0, total: 0 });
    pintar();
    expect(
      await screen.findByText(
        "Día de campo del dirigente",
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    expect(s.getCalendario).toHaveBeenCalledTimes(2);
    const sinLeer = await screen.findByText("Insumos para procedimientos");
    expect(sinLeer.closest("li")).toHaveAttribute("data-semaforo", "sin_leer");
    expect(screen.getByText(/no pudo leerla todavía/)).toBeInTheDocument();
  }, 10000);

  it("la IA dice si se repite: «Se repite» o «Solo una vez», con su razón al pasar el mouse", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde", {
        repite: true,
        anios: [2024, 2025],
        repeticion: "Es el mismo día de campo, con un monto parecido.",
      }),
      serie("3784-114-L125", "Servicio de coffee", "amarillo"),
    ]);
    pintar();
    expect(await screen.findByText("Se repite")).toHaveAttribute(
      "title",
      "Es el mismo día de campo, con un monto parecido.",
    );
    expect(screen.getByText("Solo una vez")).toBeInTheDocument();
  });

  it("descartar pide confirmar, la saca de la lista y se recupera desde «Descartadas»", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde"),
      serie("3784-114-L125", "Servicio de coffee", "amarillo"),
    ]);
    s.descartarSerie.mockImplementation(async (codigo, descartada) => ({
      codigo,
      descartada,
    }));
    pintar();
    await screen.findByText("Servicio de coffee");
    fireEvent.click(screen.getAllByRole("button", { name: "Descartar" })[1]);
    expect(s.descartarSerie).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, descartar" }));
    await waitFor(() =>
      expect(screen.queryByText("Servicio de coffee")).not.toBeInTheDocument(),
    );
    expect(s.descartarSerie).toHaveBeenCalledWith("3784-114-L125", true);

    fireEvent.click(screen.getByRole("button", { name: "Descartadas (1)" }));
    expect(screen.getByText("Servicio de coffee")).toBeInTheDocument();
    expect(
      screen.queryByText("Día de campo del dirigente"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    await waitFor(() =>
      expect(s.descartarSerie).toHaveBeenCalledWith("3784-114-L125", false),
    );
  });

  it("como la bandeja: la prioridad en su recuadro arriba, el resto por mes, y la región", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde", {
        comuna_cercana: true,
      }),
      serie("2785-86-LE26", "Encuentro de dirigentes sociales", "verde", {
        organismo: "I MUNICIPALIDAD DE SAN PEDRO DE LA PAZ",
        comuna: "San Pedro de La Paz",
        region: "Región del Biobío",
      }),
    ]);
    pintar();
    await screen.findByText("Día de campo del dirigente");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Prioridad/ }),
    ).not.toBeInTheDocument();

    // Dos recuadros: «Prioridad (1)» primero, con la de Quillón; el mes,
    // después, con la otra.
    const titulos = screen.getAllByRole("heading", { level: 3 });
    expect(titulos[0]).toHaveTextContent("Prioridad (1)");
    expect(titulos[1]).toHaveTextContent(/noviembre de 2026 \(1\)/i);
    expect(
      within(titulos[0].closest("section") as HTMLElement).getByText(
        "Día de campo del dirigente",
      ),
    ).toBeInTheDocument();
    expect(
      within(titulos[1].closest("section") as HTMLElement).getByText(
        "Encuentro de dirigentes sociales",
      ),
    ).toBeInTheDocument();

    // La región, como en la bandeja.
    fireEvent.click(screen.getByRole("button", { name: /Todas tus regiones/ }));
    const lista = within(
      document.querySelector("[data-lista-scroll]") as HTMLElement,
    );
    fireEvent.click(lista.getByRole("button", { name: "Región del Biobío" }));
    expect(
      screen.getByText("Encuentro de dirigentes sociales"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Día de campo del dirigente"),
    ).not.toBeInTheDocument();
  });

  it("prioridad es de tu rubro y de tu zona: el monto solo no cuenta, ni una roja de Quillón (decisión 64)", async () => {
    s.getCalendario.mockResolvedValue([
      serie("5040-25-LE25", "Día de campo del dirigente", "verde", {
        comuna_cercana: true,
      }),
      serie("2410-1-LE25", "Gala grande en Concepción", "verde", {
        alto_valor: true,
        comuna: "Concepción",
      }),
      serie("5040-9-LE25", "Insumos para Quillón", "rojo", {
        comuna_cercana: true,
        reciclaje: true,
      }),
    ]);
    pintar();
    await screen.findByText("Día de campo del dirigente");
    const titulos = screen.getAllByRole("heading", { level: 3 });
    expect(titulos[0]).toHaveTextContent("Prioridad (1)");
    expect(
      within(titulos[0].closest("section") as HTMLElement).queryByText(
        "Gala grande en Concepción",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Alto valor")).not.toBeInTheDocument();
    // La roja de Quillón (reciclaje, decisión 72) se ve de partida, por mes
    // y sin violeta: lo que la IA rechaza nunca es prioridad.
    const roja = screen.getByText("Insumos para Quillón").closest("li");
    expect(roja?.closest("section")).not.toBe(titulos[0].closest("section"));
    expect(
      within(roja as HTMLElement).queryByText("Comuna cercana"),
    ).not.toBeInTheDocument();
  });
});
