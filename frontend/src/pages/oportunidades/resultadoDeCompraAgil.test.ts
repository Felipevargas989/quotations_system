// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "../../components/toast/Toast";
import {
  type ConResultado,
  resultadosNuevos,
  textoDelResultado,
  useAvisoDeResultados,
} from "./resultadoDeCompraAgil";

// EL RESULTADO DE UNA COMPRA ÁGIL POSTULADA (decisión 92 del doc 17, 27-10).
// Felipe perdió la del catamarán y Eventia no le avisó: ahora la tarjeta
// dice a quién se le compró y por cuánto, y Oportunidades lo avisa una vez.

vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const PERDIDA = {
  estado: "perdida" as const,
  orden_de_compra: "1346350-45-AG26",
  proveedor: "EVENTOS DEL LAGO SPA",
  rut_proveedor: "76.123.456-7",
  monto: 7_000_000,
  fecha: "2026-10-27",
};

const mia = (
  id: number,
  resultado: ConResultado["resultado"],
  nombre = "Catamarán Sudamericano de Canotaje",
) =>
  ({
    id,
    codigo: "1346350-37-COT26",
    estado: resultado?.estado ?? "postulada",
    proceso: { nombre },
    resultado,
  }) as unknown as ConResultado;

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("el resultado de una compra ágil (decisión 92)", () => {
  it("dice a quién se le compró y por cuánto, o que ganaste", () => {
    expect(textoDelResultado(PERDIDA)).toMatch(
      /^Ganó EVENTOS DEL LAGO SPA por \$\s?7\.000\.000, orden de compra 1346350-45-AG26\.$/,
    );
    expect(
      textoDelResultado({ ...PERDIDA, estado: "ganada", proveedor: null }),
    ).toMatch(
      /^Ganaste por \$\s?7\.000\.000, orden de compra 1346350-45-AG26\.$/,
    );
    expect(
      textoDelResultado({
        ...PERDIDA,
        proveedor: null,
        rut_proveedor: null,
        monto: null,
      }),
    ).toBe("Ganó otro proveedor, orden de compra 1346350-45-AG26.");
  });

  it("solo es nuevo lo que trae resultado y no se avisó", () => {
    const lista = [mia(3219, PERDIDA), mia(40, null)];
    expect(resultadosNuevos(lista, []).map((m) => m.id)).toEqual([3219]);
    expect(
      resultadosNuevos(lista, ["3219:1346350-45-AG26"]).map((m) => m.id),
    ).toEqual([]);
  });

  it("al abrir Oportunidades lo avisa una sola vez, con un aviso que queda hasta cerrarlo", () => {
    const lista = [mia(3219, PERDIDA)];
    const { rerender } = renderHook(({ l }) => useAvisoDeResultados(l), {
      initialProps: { l: lista },
    });
    expect(toast.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.warn).mock.calls[0][0]).toMatch(
      /^Perdiste «Catamarán Sudamericano de Canotaje»\. Ganó EVENTOS DEL LAGO SPA/,
    );
    expect(vi.mocked(toast.warn).mock.calls[0][1]).toEqual({ sticky: true });
    // La lista se vuelve a pedir: no se repite.
    rerender({ l: [...lista] });
    expect(toast.warn).toHaveBeenCalledTimes(1);
  });

  it("una ganada se avisa en verde", () => {
    renderHook(() =>
      useAvisoDeResultados([
        mia(
          5171,
          { ...PERDIDA, estado: "ganada", orden_de_compra: "1030177-90-AG26" },
          "Alimentación autoridades",
        ),
      ]),
    );
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(
      /^¡Ganaste «Alimentación autoridades»! Ganaste por/,
    );
  });
});
