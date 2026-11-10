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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../services/solicitudes.service";
import type { Solicitud } from "../../services/solicitudes.service";
import SolicitudesPorAprobar from "./SolicitudesPorAprobar";

// «SOLICITUDES» (doc 19 §9.45): lo que mandó recepción, para aprobarlo y
// emitirlo o rechazarlo, con el aviso de dos iguales del mismo día.

vi.mock("../../services/solicitudes.service", () => ({
  getSolicitudes: vi.fn(),
  aprobarSolicitud: vi.fn(),
  rechazarSolicitud: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../components/FileViewLink", () => ({
  default: () => <span>Ver PDF</span>,
}));

const solicitud = (s: Partial<Solicitud>): Solicitud => ({
  id: 1,
  tipo: 39,
  estado: "pendiente",
  total: 60000,
  medio_de_pago: "efectivo",
  correo: "huesped@correo.cl",
  imprimir: false,
  para: "Cabaña 4",
  rut: null,
  lineas: [{ descripcion: "Cabaña 4 · Tinaja", cantidad: 2, monto: 60000 }],
  turno_de_caja_id: 7,
  solicitada_por_nombre: "Recepción",
  solicitada_por_cargo: "recepcion",
  created_at: "2026-11-09T15:00:00Z",
  resuelta_por_nombre: null,
  resuelta_en: null,
  motivo_rechazo: null,
  error: null,
  documento: null,
  igual_a: null,
  ...s,
});

beforeEach(() => {
  vi.mocked(api.getSolicitudes).mockResolvedValue({
    pendientes: 2,
    solicitudes: [
      solicitud({ id: 2, igual_a: 1 }),
      solicitud({ id: 1, created_at: "2026-11-09T14:00:00Z" }),
      solicitud({
        id: 3,
        estado: "rechazada",
        motivo_rechazo: "Ya boleteada",
        resuelta_por_nombre: "Camila",
      }),
    ],
  });
  vi.mocked(api.aprobarSolicitud).mockResolvedValue({
    solicitud: null,
    documento: {
      id: 900,
      tipo: 39,
      folio: 45010,
      estado: "emitido",
      total: 60000,
      ambiente: "produccion",
      pdf_path: null,
    },
    aviso: null,
  });
  vi.mocked(api.rechazarSolicitud).mockResolvedValue(
    solicitud({ estado: "rechazada" }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SolicitudesPorAprobar />
    </QueryClientProvider>,
  );

describe("las solicitudes de recepción (§9.45)", () => {
  it("por aprobar arriba, con el aviso de una igual, y las resueltas abajo", async () => {
    abrir();
    expect(await screen.findByText("Por aprobar (2)")).toBeInTheDocument();
    expect(screen.getByText(/Igual a otra de las/)).toBeInTheDocument();
    expect(screen.getByText("Resueltas (últimos 7 días)")).toBeInTheDocument();
    expect(screen.getByText("Rechazada")).toBeInTheDocument();
    expect(screen.getByText("Ya boleteada")).toBeInTheDocument();
    expect(screen.getAllByText(/huesped@correo\.cl/).length).toBe(3);
  });

  it("«Aprobar y emitir» la emite; «Rechazar» pregunta y la deja sin emitir", async () => {
    abrir();
    const aprobar = await screen.findAllByRole("button", {
      name: "Aprobar y emitir",
    });
    fireEvent.click(aprobar[0]);
    await waitFor(() => expect(api.aprobarSolicitud).toHaveBeenCalledWith(2));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Rechazar" })[0],
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Rechazar" })[1]);
    fireEvent.change(screen.getByPlaceholderText("Motivo (opcional)"), {
      target: { value: "Ya boleteada" },
    });
    expect(screen.getByText("¿Rechazarla? No se emite.")).toBeInTheDocument();
    // El «Rechazar» de la pregunta, en la fila de la 1.
    const rechazar = screen.getAllByRole("button", { name: "Rechazar" });
    fireEvent.click(rechazar[rechazar.length - 1]);
    await waitFor(() =>
      expect(api.rechazarSolicitud).toHaveBeenCalledWith(1, "Ya boleteada"),
    );
  });
});
