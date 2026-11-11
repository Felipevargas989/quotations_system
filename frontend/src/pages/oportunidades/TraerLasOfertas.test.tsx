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
import { toast } from "../../components/toast/Toast";
import * as servicio from "../../services/comparacion.service";
import TraerLasOfertas from "./TraerLasOfertas";
import {
  avisoDeLoTraido,
  claveDeLaCompetencia,
  claveDeTraerOfertas,
} from "./useTraerOfertas";

// «TRAER LAS OFERTAS» (decisión 123, 10-11). Felipe, con la 5040-14-LE26
// postulada y ya cerrada: "acá eventia no me puede traer los documentos de
// la otra propuesta para compararlas" y "con un botón acá en eventia". El
// motor va de mentira.

vi.mock("../../services/comparacion.service", () => ({
  getEstadoDeTraerOfertas: vi.fn(),
  traerOfertas: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
const s = vi.mocked(servicio);
const t = vi.mocked(toast);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const quieto = { trayendo: false, ultima: null };

const traidas = (cambios: Partial<servicio.OfertasTraidas> = {}) => ({
  publicadas: true,
  oferentes: 3,
  traidos: 46,
  yaEstaban: 0,
  noSeTraen: 0,
  incompleto: false,
  ...cambios,
});

const termino = (
  resultado: servicio.OfertasTraidas | null,
  error: string | null = null,
) => ({
  trayendo: false,
  ultima: { terminada_en: "2026-11-10T23:30:00.000Z", error, resultado },
});

const pintar = () => {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cliente}>
      <TraerLasOfertas oportunidadId={84} />
    </QueryClientProvider>,
  );
  return cliente;
};

describe("Traer las ofertas", () => {
  it("pide las ofertas al motor, queda «Trayendo…» sin dejar apretar de nuevo y, al terminar, dice cuántas llegaron y refresca la lista", async () => {
    s.getEstadoDeTraerOfertas.mockResolvedValue(quieto);
    s.traerOfertas.mockResolvedValue({ trayendo: true, ultima: null });
    const cliente = pintar();
    const refrescos = vi.spyOn(cliente, "invalidateQueries");

    const boton = await screen.findByRole("button", {
      name: /Traer las ofertas/,
    });
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    await waitFor(() => expect(s.traerOfertas).toHaveBeenCalledWith(84));

    const trayendo = await screen.findByRole("button", { name: "Trayendo…" });
    expect(trayendo).toBeDisabled();
    // Quieto: el botón guarda el texto largo (oculto) para no cambiar de
    // ancho, y lo que hay que decir va debajo.
    expect(within(trayendo).getByText("Traer las ofertas")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const aviso = screen.getByText(/Mercado Público las entrega de a una/);
    expect(
      trayendo.compareDocumentPosition(aviso) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Mientras trae, la lista de la competencia se pide de nuevo: las
    // ofertas van apareciendo.
    await waitFor(() =>
      expect(refrescos).toHaveBeenCalledWith({
        queryKey: claveDeLaCompetencia(84),
      }),
    );
    expect(t.success).not.toHaveBeenCalled();

    // El motor termina: la próxima pregunta dice que ya no trae.
    refrescos.mockClear();
    s.getEstadoDeTraerOfertas.mockResolvedValue(termino(traidas()));
    await cliente.invalidateQueries({ queryKey: claveDeTraerOfertas(84) });

    await waitFor(() =>
      expect(t.success).toHaveBeenCalledWith(
        "Llegaron 46 archivos de 3 oferentes.",
      ),
    );
    expect(t.success).toHaveBeenCalledTimes(1);
    expect(refrescos).toHaveBeenCalledWith({
      queryKey: claveDeLaCompetencia(84),
    });
    expect(
      await screen.findByRole("button", { name: /Traer las ofertas/ }),
    ).toBeEnabled();
    // Y queda dicho debajo del botón.
    expect(
      screen.getByText("Llegaron 46 archivos de 3 oferentes."),
    ).toHaveClass("text-green-700");
  });

  it("al volver a la pestaña mientras el motor trae, «Trayendo…» sigue a la vista y no deja apretar", async () => {
    s.getEstadoDeTraerOfertas.mockResolvedValue({
      trayendo: true,
      ultima: null,
    });
    pintar();
    expect(
      await screen.findByRole("button", { name: "Trayendo…" }),
    ).toBeDisabled();
    expect(s.traerOfertas).not.toHaveBeenCalled();
  });

  it("al volver cuando ya terminó, lo dice debajo del botón y no avisa de nuevo", async () => {
    s.getEstadoDeTraerOfertas.mockResolvedValue(
      termino(traidas({ traidos: 0, yaEstaban: 46 })),
    );
    pintar();
    expect(
      await screen.findByText("Ya estaba todo: 46 archivos de 3 oferentes."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Traer las ofertas/ }),
    ).toBeEnabled();
    expect(t.success).not.toHaveBeenCalled();
    expect(t.warn).not.toHaveBeenCalled();
  });

  it("si Mercado Público todavía no muestra las ofertas, lo avisa en ámbar; si falla, en rojo", async () => {
    s.getEstadoDeTraerOfertas.mockResolvedValue(quieto);
    s.traerOfertas.mockResolvedValue({ trayendo: true, ultima: null });
    const cliente = pintar();
    fireEvent.click(
      await screen.findByRole("button", { name: /Traer las ofertas/ }),
    );
    await screen.findByRole("button", { name: "Trayendo…" });
    s.getEstadoDeTraerOfertas.mockResolvedValue(
      termino(traidas({ publicadas: false, oferentes: 0, traidos: 0 })),
    );
    await cliente.invalidateQueries({ queryKey: claveDeTraerOfertas(84) });
    await waitFor(() =>
      expect(t.warn).toHaveBeenCalledWith(
        expect.stringMatching(/todavía no muestra las ofertas/),
      ),
    );
    expect(screen.getByText(/todavía no muestra las ofertas/)).toHaveClass(
      "text-amber-700",
    );

    fireEvent.click(screen.getByRole("button", { name: /Traer las ofertas/ }));
    await screen.findByRole("button", { name: "Trayendo…" });
    const fallo =
      "No se pudieron traer las ofertas: Mercado Público respondió 503. Inténtalo en un rato; lo que alcanzó a llegar no se repite.";
    s.getEstadoDeTraerOfertas.mockResolvedValue(termino(null, fallo));
    await cliente.invalidateQueries({ queryKey: claveDeTraerOfertas(84) });
    await waitFor(() => expect(t.error).toHaveBeenCalledWith(fallo));
    expect(screen.getByText(fallo)).toHaveClass("text-red-600");
  });

  it("si el motor no deja partir (ya las trae, o falta el RUT), avisa con su mensaje y vuelve a preguntar cómo va", async () => {
    s.getEstadoDeTraerOfertas.mockResolvedValue(quieto);
    s.traerOfertas.mockRejectedValue({
      response: {
        data: {
          message:
            "Ya estoy trayendo las ofertas de esta licitación: aparecen solas al terminar.",
        },
      },
    });
    pintar();
    const boton = await screen.findByRole("button", {
      name: /Traer las ofertas/,
    });
    await waitFor(() => expect(boton).toBeEnabled());
    s.getEstadoDeTraerOfertas.mockResolvedValue({
      trayendo: true,
      ultima: null,
    });
    fireEvent.click(boton);
    await waitFor(() =>
      expect(t.error).toHaveBeenCalledWith(
        "Ya estoy trayendo las ofertas de esta licitación: aparecen solas al terminar.",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Trayendo…" }),
    ).toBeDisabled();
  });
});

describe("Lo que dejó la vuelta, en una línea", () => {
  it("cuántos archivos de cuántos oferentes, en singular y en plural, con lo que ya estaba", () => {
    expect(avisoDeLoTraido(traidas())).toEqual({
      tono: "bien",
      texto: "Llegaron 46 archivos de 3 oferentes.",
    });
    expect(
      avisoDeLoTraido(traidas({ oferentes: 1, traidos: 1, yaEstaban: 1 })),
    ).toEqual({
      tono: "bien",
      texto: "Llegó 1 archivo de 1 oferente (1 ya estaba).",
    });
    expect(avisoDeLoTraido(traidas({ traidos: 5, yaEstaban: 41 })).texto).toBe(
      "Llegaron 5 archivos de 3 oferentes (41 ya estaban).",
    );
  });

  it("sin cuadro todavía, sin competencia o sin archivos que traer, lo dice", () => {
    expect(
      avisoDeLoTraido(traidas({ publicadas: false, oferentes: 0, traidos: 0 })),
    ).toEqual({
      tono: "ojo",
      texto:
        "Mercado Público todavía no muestra las ofertas de esta licitación: aparecen con la apertura, después del cierre.",
    });
    expect(avisoDeLoTraido(traidas({ oferentes: 0, traidos: 0 })).texto).toBe(
      "Solo tu empresa presentó oferta: no hay competencia que traer.",
    );
    expect(
      avisoDeLoTraido(traidas({ oferentes: 2, traidos: 0, noSeTraen: 2 })),
    ).toEqual({
      tono: "bien",
      texto:
        "Los otros 2 oferentes no adjuntaron archivos que se puedan traer. 2 no se traen: comprimidos o de más de 30 MB.",
    });
    expect(avisoDeLoTraido(traidas({ oferentes: 1, traidos: 0 })).texto).toBe(
      "El otro oferente no adjuntó archivos que se puedan traer.",
    );
  });

  it("si quedó algo sin traer, pide apretar de nuevo, en ámbar", () => {
    expect(avisoDeLoTraido(traidas({ traidos: 80, incompleto: true }))).toEqual(
      {
        tono: "ojo",
        texto:
          "Llegaron 80 archivos de 3 oferentes. Quedó algo sin traer: aprieta de nuevo.",
      },
    );
    expect(
      avisoDeLoTraido(traidas({ traidos: 0, incompleto: true })).texto,
    ).toBe("Quedó algo sin traer: aprieta de nuevo.");
  });
});
