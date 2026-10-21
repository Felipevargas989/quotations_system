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
import { afterEach, describe, expect, it, vi } from "vitest";
import * as reembolsos from "../../services/refunds.service";
import { resumenDeReembolsos } from "../../utils/reembolsosDelEvento";
import BarraDelEvento from "./BarraDelEvento";
import ReembolsosDelEvento from "./ReembolsosDelEvento";
import RegistrarReembolsoPanel from "./RegistrarReembolsoPanel";

// REEMBOLSOS POR PARTES (20-10-2026). Felipe: "la misma barra que hoy día
// es verde (…) se transforma en una barra roja que se va vaciando", con
// «Registrar reembolso» y cada reembolso como una fila con ver, editar y
// eliminar, igual que el calendario de pagos.

vi.mock("../../services/refunds.service", () => ({
  getRefundsByQuotation: vi.fn(),
  registrarReembolso: vi.fn(),
  eliminarReembolso: vi.fn(),
  registerRefund: vi.fn(),
}));
vi.mock("../../services/storage.service", () => ({
  uploadRefundReceipt: vi.fn(),
}));
const r = vi.mocked(reembolsos);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fila = (
  id: string,
  amount: number,
  is_paid: boolean,
  refund_date: string | null = null,
) =>
  ({
    id,
    amount,
    is_paid,
    quotation_id: "q1",
    refund_date,
    payment_method: is_paid ? "Transferencia" : null,
    receipt_url: is_paid ? "c1/refund-receipts/q1/x.pdf" : null,
  }) as never;

describe("resumenDeReembolsos", () => {
  it("lo pendiente es lo que falta; lo registrado, las filas pagadas", () => {
    const s = resumenDeReembolsos([
      fila("1", 6000000, false),
      fila("2", 3000000, true, "2026-10-21"),
      fila("3", 1000000, true, "2026-10-20"),
    ]);
    expect(s.pendiente).toBe(6000000);
    expect(s.registrado).toBe(4000000);
    expect(s.total).toBe(10000000);
    expect(s.registrados.map((x) => x.id)).toEqual(["3", "2"]);
  });
});

describe("BarraDelEvento", () => {
  it("anulado con reembolso: la misma barra se vuelve roja y se vacía", () => {
    const { container } = render(
      <BarraDelEvento
        pct={100}
        cuotas={3}
        reembolso={{ pendiente: 6000000, total: 10000000, registrados: [1] }}
      />,
    );
    expect(
      screen.getByText("Por reembolsar $6.000.000 de $10.000.000"),
    ).toBeInTheDocument();
    const relleno = container.querySelector(".from-red-400") as HTMLElement;
    expect(relleno.style.width).toBe("60%");
    expect(screen.queryByText(/% pagado/)).not.toBeInTheDocument();
  });

  it("todo devuelto: la barra queda vacía", () => {
    const { container } = render(
      <BarraDelEvento
        pct={100}
        cuotas={3}
        reembolso={{ pendiente: 0, total: 10000000, registrados: [1, 2] }}
      />,
    );
    expect(
      screen.getByText("Reembolsado completo · $10.000.000"),
    ).toBeInTheDocument();
    expect(
      (container.querySelector(".from-red-400") as HTMLElement).style.width,
    ).toBe("0%");
  });

  it("evento vigente: verde, como siempre", () => {
    render(<BarraDelEvento pct={56} cuotas={3} reembolso={null} />);
    expect(screen.getByText("56% pagado")).toBeInTheDocument();
  });
});

describe("Registrar reembolso", () => {
  it("propone lo que falta y lo registra contra la cotización", async () => {
    r.registrarReembolso.mockResolvedValue({ error: null });
    const onChanged = vi.fn();
    render(
      <RegistrarReembolsoPanel
        quotationId="q1"
        pendiente={6000000}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByText("+ Registrar reembolso"));
    expect(
      screen.getByText("Falta por reembolsar $6.000.000"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Guardar reembolso"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(r.registrarReembolso).toHaveBeenCalledWith(
      expect.objectContaining({
        quotation_id: "q1",
        amount: 6000000,
        payment_method: "Transferencia",
      }),
    );
  });

  it("sin nada por devolver no hay botón", () => {
    const { container } = render(
      <RegistrarReembolsoPanel
        quotationId="q1"
        pendiente={0}
        onChanged={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReembolsosDelEvento", () => {
  const pintar = (conBoton: boolean, onVer = vi.fn()) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ReembolsosDelEvento
          quotationId="q1"
          conBoton={conBoton}
          onChanged={vi.fn()}
          onVer={onVer}
        />
      </QueryClientProvider>,
    );

  it("cada fila es un reembolso registrado; lo pendiente no es fila", async () => {
    r.getRefundsByQuotation.mockResolvedValue([
      fila("1", 6000000, false),
      fila("2", 4000000, true, "2026-10-20"),
    ]);
    pintar(false);
    expect(
      await screen.findByText("$4.000.000 · 20/10/2026"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$6\.000\.000/)).not.toBeInTheDocument();
  });

  it("en un evento vigente dice lo que falta y trae su botón", async () => {
    r.getRefundsByQuotation.mockResolvedValue([fila("1", 500000, false)]);
    pintar(true);
    expect(
      await screen.findByText("Por reembolsar $500.000"),
    ).toBeInTheDocument();
    expect(screen.getByText("+ Registrar reembolso")).toBeInTheDocument();
  });

  it("«Ver» manda el comprobante al visor, como los abonos", async () => {
    r.getRefundsByQuotation.mockResolvedValue([
      fila("2", 4000000, true, "2026-10-20"),
    ]);
    const onVer = vi.fn();
    pintar(false, onVer);
    fireEvent.click(await screen.findByText("Ver"));
    expect(onVer).toHaveBeenCalledWith(
      expect.objectContaining({ file_url: "c1/refund-receipts/q1/x.pdf" }),
    );
  });

  it("eliminar pregunta y devuelve el monto a lo que falta", async () => {
    r.getRefundsByQuotation.mockResolvedValue([
      fila("2", 4000000, true, "2026-10-20"),
    ]);
    r.eliminarReembolso.mockResolvedValue({ error: null });
    pintar(false);
    fireEvent.click(await screen.findByLabelText("Eliminar reembolso"));
    expect(
      screen.getByText(/Su monto vuelve a lo que falta por devolver/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sí, eliminar"));
    await waitFor(() => expect(r.eliminarReembolso).toHaveBeenCalledWith("2"));
  });
});
