// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as documentos from "../../services/documentosTributarios.service";
import TraerFactura from "./TraerFactura";

// TRAER UNA FACTURA EMITIDA FUERA DE EVENTIA (doc 19 §9.36; Felipe, 08-11:
// «¿podrás traer estas facturas para hacer las notas de crédito desde
// acá?»). Datos inventados.

vi.mock("../../services/documentosTributarios.service", () => ({
  traerFactura: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const d = vi.mocked(documentos);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LEIDA: documentos.FacturaTraida = {
  folio: 374,
  fecha_emision: "2026-10-30",
  receptor: {
    rut: "65123456-5",
    razon_social: "CORPORACION EJEMPLO DE EDUCACION",
    giro: "EDUCACION",
    direccion: "AV. LOS AROMOS 4835",
    comuna: "SAN JOAQUIN",
    ciudad: "SANTIAGO",
  },
  referencias: [{ tipo: "801", folio: "32000066941", fecha: "2026-10-30" }],
  lineas: [
    {
      descripcion: "Fiesta de navidad",
      descripcionLarga: null,
      cantidad: 1,
      precio: 2201621,
    },
  ],
  exento: 0,
  neto: 2201621,
  iva: 418308,
  total: 2619929,
  evento: { cotizacion: 481, oc: "32000066941" },
};

const escribir = (n: string) =>
  fireEvent.change(screen.getByPlaceholderText("374"), {
    target: { value: n },
  });

describe("Traer factura emitida fuera de Eventia (§9.36)", () => {
  it("lee la factura de facturacion.cl, la muestra y la trae a Eventia", async () => {
    d.traerFactura
      .mockResolvedValueOnce({ factura: LEIDA, guardada: null })
      .mockResolvedValueOnce({ factura: LEIDA, guardada: { id: 90 } });
    const onTraida = vi.fn();
    render(<TraerFactura onVolver={() => {}} onTraida={onTraida} />);
    escribir("374");
    fireEvent.click(
      screen.getByRole("button", { name: "Leer de facturacion.cl" }),
    );
    expect(
      await screen.findByText("Factura N° 374 · 30-10-2026"),
    ).toBeInTheDocument();
    expect(d.traerFactura).toHaveBeenCalledWith(374, false);
    expect(
      screen.getByText("CORPORACION EJEMPLO DE EDUCACION"),
    ).toBeInTheDocument();
    expect(screen.getByText("#481")).toBeInTheDocument();
    expect(screen.getByText("32000066941 · 30-10-2026")).toBeInTheDocument();
    expect(screen.getByText("$2.619.929")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Traer a Eventia/ }));
    await waitFor(() =>
      expect(onTraida).toHaveBeenCalledWith(90, "2026-10-30"),
    );
    expect(d.traerFactura).toHaveBeenLastCalledWith(374, true);
  });

  it("si facturacion.cl cortó el nombre, lo muestra completo según el SII", async () => {
    d.traerFactura.mockResolvedValueOnce({
      factura: {
        ...LEIDA,
        receptor: {
          ...LEIDA.receptor,
          razon_social: "CORPORACION EJEMPLO DE EDUCACION SUPERIOR",
        },
        nombre_del_sii: true,
      },
      guardada: null,
    });
    render(<TraerFactura onVolver={() => {}} onTraida={vi.fn()} />);
    escribir("375");
    fireEvent.click(
      screen.getByRole("button", { name: "Leer de facturacion.cl" }),
    );
    expect(
      await screen.findByText("CORPORACION EJEMPLO DE EDUCACION SUPERIOR"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Completo según el SII: facturacion.cl lo cortó en su PDF",
      ),
    ).toBeInTheDocument();
  });

  it("si no se puede leer, dice por qué y no ofrece traerla", async () => {
    d.traerFactura.mockRejectedValueOnce({
      response: {
        data: { message: "La factura N° 381 ya está en Eventia" },
      },
    });
    render(<TraerFactura onVolver={() => {}} onTraida={vi.fn()} />);
    escribir("381");
    fireEvent.click(
      screen.getByRole("button", { name: "Leer de facturacion.cl" }),
    );
    expect(
      await screen.findByText("La factura N° 381 ya está en Eventia"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Traer a Eventia/ }),
    ).not.toBeInTheDocument();
  });
});
