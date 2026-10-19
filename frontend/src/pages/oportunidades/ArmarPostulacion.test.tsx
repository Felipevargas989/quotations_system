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
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as servicio from "../../services/oportunidades.service";
import * as postulacion from "../../services/postulacion.service";
import ArmarPostulacion from "./ArmarPostulacion";

// «ARMAR POSTULACIÓN» (decisión 35, 19-10): un solo botón que pide el
// precio; después, cómo va cada paso y «Reintentar» lo que falló.

vi.mock("../../services/oportunidades.service", () => ({
  getAdjuntos: vi.fn(),
  getAnalisis: vi.fn(),
  getOferente: vi.fn(),
  getGeneraciones: vi.fn(),
  generarAnexos: vi.fn(),
  crearPropuestaTecnica: vi.fn(),
}));
vi.mock("../../services/postulacion.service", () => ({
  armarPostulacion: vi.fn(),
  getOfertaDeLaPostulacion: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const s = vi.mocked(servicio);
const p = vi.mocked(postulacion);

beforeEach(() => {
  s.getAdjuntos.mockResolvedValue([]);
  s.getAnalisis.mockResolvedValue({
    id: 1,
    estado: "listo",
    resultado: { formularios: [] },
  } as never);
  s.getOferente.mockResolvedValue({
    oferente: {
      razon_social: "VALLE DEL SOL QUILLON SPA",
      rut: "77.701.305-K",
    },
  } as never);
  s.getGeneraciones.mockResolvedValue({
    anexos: null,
    firma: null,
    propuesta: null,
  });
  p.getOfertaDeLaPostulacion.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (congelada = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <ArmarPostulacion oportunidadId={40} congelada={congelada} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Armar postulación", () => {
  it("pide solo el precio y arma todo con un botón", async () => {
    p.armarPostulacion.mockResolvedValue({
      id: 21,
      estado: "procesando",
      creado_en: "2026-10-19T17:00:00.000Z",
      terminado_en: null,
      parametros: { postulacion: { total: 11_900_000, propuesta: true } },
    } as never);
    pintar();
    const boton = await screen.findByRole("button", {
      name: "Armar postulación",
    });
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Precio total, con IVA"), {
      target: { value: "11900000" },
    });
    expect(
      await screen.findByText(/Neto \$10\.000\.000 \+ IVA \$1\.900\.000/),
    ).toBeInTheDocument();
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    await waitFor(() =>
      expect(p.armarPostulacion).toHaveBeenCalledWith(40, 11_900_000),
    );
    expect(
      await screen.findByText(/La IA está armando la oferta con tu catálogo/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Armando la postulación…" }),
    ).toBeDisabled();
  });

  it("postulada, no se vuelve a armar", async () => {
    pintar(true);
    expect(
      await screen.findByRole("button", { name: "Armar postulación" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Precio total, con IVA")).toBeDisabled();
  });

  it("muestra cada paso y reintenta lo que falló con el mismo precio", async () => {
    p.getOfertaDeLaPostulacion.mockResolvedValue({
      id: 21,
      estado: "listo",
      creado_en: "2026-10-19T17:00:00.000Z",
      terminado_en: "2026-10-19T17:04:00.000Z",
      parametros: { postulacion: { total: 11_900_000, propuesta: false } },
      resultado: null,
    } as never);
    s.getGeneraciones.mockResolvedValue({
      anexos: {
        id: 30,
        tipo: "anexos",
        estado: "error",
        error: "La IA tardó demasiado en responder: vuelve a intentar.",
        creado_en: "2026-10-19T17:04:10.000Z",
        terminado_en: "2026-10-19T17:09:10.000Z",
        costo_usd: null,
        no_leidos: [],
        resultado: null,
      },
      firma: null,
      propuesta: null,
    } as never);
    s.generarAnexos.mockResolvedValue({
      id: 31,
      estado: "procesando",
    } as never);
    pintar();
    expect(
      await screen.findByText(
        "La IA tardó demasiado en responder: vuelve a intentar.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Las bases no la piden: va el anexo de calidad de la oferta.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Precio total, con IVA")).toHaveValue(
      "11.900.000",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() =>
      expect(s.generarAnexos).toHaveBeenCalledWith(40, {
        monto_total: 11_900_000,
      }),
    );
  });

  it("sin la razón social o el RUT, lo dice y no deja partir", async () => {
    s.getOferente.mockResolvedValue({
      oferente: { razon_social: "VALLE DEL SOL", rut: "" },
    } as never);
    pintar();
    expect(await screen.findByText("Ir a «Mi empresa»")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Precio total, con IVA"), {
      target: { value: "11900000" },
    });
    expect(
      screen.getByRole("button", { name: "Armar postulación" }),
    ).toBeDisabled();
  });
});
