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
import * as pagos from "../services/payments.service";
import * as reembolsos from "../services/refunds.service";
import {
  cambioDeAnulacion,
  disponibleParaReembolsar,
} from "../utils/reembolsoAlAnular";
import MotivoPerdida from "./MotivoPerdida";

// REEMBOLSO AL ANULAR (20-10-2026). Felipe: "al momento de anular un evento
// con reembolsos el sistema debería preguntar si se reembolsarán los
// ingresos y si se coloca sí, generar el reembolso". La #465 se anuló con
// $1.394.000 abonados y nadie supo que había que devolverlos.

vi.mock("../services/payments.service", () => ({
  getPaymentsByQuotationId: vi.fn(),
}));
vi.mock("../services/refunds.service", () => ({
  getRefundsByQuotation: vi.fn(),
}));
const p = vi.mocked(pagos);
const r = vi.mocked(reembolsos);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conAbonos = (montos: number[], reembolsado: number[] = []) => {
  p.getPaymentsByQuotationId.mockResolvedValue({
    data: montos.map((m) => ({ payment_transactions: [{ amount: m }] })),
  });
  r.getRefundsByQuotation.mockResolvedValue(
    reembolsado.map((amount) => ({ amount })) as never,
  );
};

const anular = (
  onConfirmar = vi.fn(),
  quotationId: string | undefined = "q1",
) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MotivoPerdida
        tipo="anulacion"
        quotationId={quotationId}
        onConfirmar={onConfirmar}
        onCancelar={vi.fn()}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("No pudimos atenderlo"));
  return onConfirmar;
};

const confirmar = () => screen.getByRole("button", { name: "Confirmar" });

describe("Anular con abonos", () => {
  it("pregunta si se reembolsan y no deja anular sin responder", async () => {
    conAbonos([250000, 1144000]);
    anular();
    expect(
      await screen.findByText(/Este evento tiene \$1\.394\.000 abonados/),
    ).toBeInTheDocument();
    expect(confirmar()).toBeDisabled();
  });

  it("«No»: anula sin reembolso", async () => {
    conAbonos([250000, 1144000]);
    const onConfirmar = anular();
    fireEvent.click(await screen.findByText("No"));
    await waitFor(() => expect(confirmar()).toBeEnabled());
    fireEvent.click(confirmar());
    expect(onConfirmar).toHaveBeenCalledWith("no_pudimos", "", undefined);
  });

  it("«Sí»: propone todo lo abonado sin reembolsar y lo entrega", async () => {
    conAbonos([250000, 1144000], [394000]);
    const onConfirmar = anular();
    fireEvent.click(await screen.findByText("Sí, reembolsar"));
    await waitFor(() => expect(confirmar()).toBeEnabled());
    fireEvent.click(confirmar());
    expect(onConfirmar).toHaveBeenCalledWith("no_pudimos", "", 1000000);
  });

  it("sin abonos no pregunta nada", async () => {
    conAbonos([]);
    anular();
    await waitFor(() => expect(confirmar()).toBeEnabled());
    expect(screen.queryByText(/¿Se reembolsan\?/)).not.toBeInTheDocument();
  });

  it("al rechazar una venta no se pregunta por reembolsos", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MotivoPerdida
          tipo="rechazo"
          onConfirmar={vi.fn()}
          onCancelar={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(p.getPaymentsByQuotationId).not.toHaveBeenCalled();
  });
});

describe("utilidades del reembolso al anular", () => {
  it("lo abonado menos lo ya reembolsado, nunca negativo", () => {
    const cuotas = [
      { payment_transactions: [{ amount: 250000 }] },
      { payment_transactions: [{ amount: "1144000" }] },
    ];
    expect(disponibleParaReembolsar(cuotas, [])).toBe(1394000);
    expect(disponibleParaReembolsar(cuotas, [{ amount: 1500000 }])).toBe(0);
  });

  it("el parche de anular lleva el monto solo si se reembolsa", () => {
    expect(cambioDeAnulacion("no_pudimos")).toEqual({
      quotation_status: "cancelada",
      loss_reason: "no_pudimos",
    });
    expect(cambioDeAnulacion("no_pudimos", 1394000)).toMatchObject({
      reembolso_al_anular: 1394000,
    });
  });
});
