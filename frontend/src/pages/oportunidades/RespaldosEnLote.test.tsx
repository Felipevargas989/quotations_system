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
import * as oportunidades from "../../services/oportunidades.service";
import * as postulacion from "../../services/postulacion.service";
import RespaldosEnLote from "./RespaldosEnLote";

// VARIOS RESPALDOS QUE SE LEEN SOLOS (decisión 34, 19-10): se eligen las
// órdenes de compra o facturas, la IA lee cada una, se revisa y se guarda.

vi.mock("../../services/oportunidades.service", () => ({
  subirDocumentoDeEmpresa: vi.fn(),
}));
vi.mock("../../services/postulacion.service", () => ({
  leerRespaldo: vi.fn(),
  leerOrdenDeCompra: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const o = vi.mocked(oportunidades);
const p = vi.mocked(postulacion);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pdf = (nombre: string) =>
  new File(["%PDF-1.7"], nombre, { type: "application/pdf" });

describe("Respaldos en lote", () => {
  it("lee cada archivo, muestra lo leído y guarda todos con sus datos", async () => {
    p.leerRespaldo
      .mockResolvedValueOnce({
        datos: {
          numero: "4352-103-SE23",
          mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
          contrato: "CENA DÍA DEL FUNCIONARIO",
          anio: 2023,
          monto: 11_782_499,
          fuente: "mercado_publico",
        },
        aviso: null,
      })
      .mockRejectedValueOnce({
        response: {
          data: { message: "No encontré el número: complétalo a mano." },
        },
      });
    o.subirDocumentoDeEmpresa.mockResolvedValue({} as never);
    const alGuardar = vi.fn();
    render(<RespaldosEnLote alGuardar={alGuardar} />);

    const oc = pdf("OC 4352-103-SE23.pdf");
    const factura = pdf("factura borrosa.pdf");
    fireEvent.change(
      screen.getByLabelText("Elegir órdenes de compra o facturas"),
      { target: { files: [oc, factura] } },
    );

    expect(
      await screen.findByText(
        "N° 4352-103-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON · 2023 · $11.782.499",
      ),
    ).toBeInTheDocument();
    // La que no se leyó queda abierta para completarla a mano.
    expect(
      await screen.findByText("No encontré el número: complétalo a mano."),
    ).toBeInTheDocument();
    expect(p.leerRespaldo).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Guardar 1 respaldo" }));
    await waitFor(() =>
      expect(o.subirDocumentoDeEmpresa).toHaveBeenCalledWith(
        oc,
        "respaldo_experiencia",
        "",
        expect.objectContaining({ numero: "4352-103-SE23" }),
      ),
    );
    expect(o.subirDocumentoDeEmpresa).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(alGuardar).toHaveBeenCalled());
  });

  it("un Word no se lee solo: lo dice y no lo agrega", () => {
    render(<RespaldosEnLote alGuardar={vi.fn()} />);
    fireEvent.change(
      screen.getByLabelText("Elegir órdenes de compra o facturas"),
      {
        target: {
          files: [
            new File(["x"], "orden.docx", { type: "application/msword" }),
          ],
        },
      },
    );
    expect(p.leerRespaldo).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
  });

  it("sin duplicados (decisión 77): lo que ya está no se guarda y lo repetido en la tanda va una vez", async () => {
    const datos = (numero: string) => ({
      numero,
      mandante: "ILUSTRE MUNICIPALIDAD DE QUILLON",
      contrato: "Evento",
      anio: 2023,
      monto: 1_000_000,
      fuente: "mercado_publico" as const,
    });
    p.leerRespaldo
      .mockResolvedValueOnce({
        datos: datos("5040-536-SE23"),
        aviso: null,
        ya_esta:
          "Ya está en «Mi empresa»: Orden de compra - 5040-536-SE23.pdf, subida el 19-10-2026.",
      })
      .mockResolvedValueOnce({
        datos: datos("1715-123-SE24"),
        aviso: null,
        ya_esta: null,
      })
      .mockResolvedValueOnce({
        datos: datos("1715-123-se24"),
        aviso: null,
        ya_esta: null,
      });
    o.subirDocumentoDeEmpresa.mockResolvedValue({} as never);
    render(<RespaldosEnLote alGuardar={vi.fn()} />);
    fireEvent.change(
      screen.getByLabelText("Elegir órdenes de compra o facturas"),
      {
        target: {
          files: [
            pdf("5040-536-SE23.pdf"),
            pdf("CAJ.pdf"),
            pdf("CAJ copia.pdf"),
          ],
        },
      },
    );
    expect(
      await screen.findByText(
        "Ya está en «Mi empresa»: Orden de compra - 5040-536-SE23.pdf, subida el 19-10-2026. No se guarda.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Repetida en esta tanda: se guarda una sola."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar 1 respaldo" }));
    await waitFor(() =>
      expect(o.subirDocumentoDeEmpresa).toHaveBeenCalledTimes(1),
    );
    expect(o.subirDocumentoDeEmpresa.mock.calls[0][3]).toMatchObject({
      numero: "1715-123-SE24",
    });
  });
});
