// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "../../components/toast/Toast";
import {
  type ConResultado,
  colorDelResultado,
  resultadosNuevos,
  textoDelResultadoPublico,
  textoDelResultado,
  useAvisoDeResultados,
} from "./resultadoDeCompraAgil";

// EL RESULTADO DE UNA COMPRA ÁGIL POSTULADA (decisión 92 del doc 17, 27-10).
// Felipe perdió la del catamarán y Eventia no le avisó: ahora la tarjeta
// dice a quién eligieron, por cuánto y cómo quedaste por precio, que es el
// criterio de la ley en una compra ágil (decisión 93), y Oportunidades lo
// avisa una vez.

vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** El catamarán, como lo dejó el motor el 27-10. */
const PERDIDA = {
  estado: "perdida" as const,
  proveedor: "BPM EVENTOS SPA",
  rut_proveedor: "76.430.926-k",
  monto: 6_800_000,
  mi_monto: 7_090_000,
  lugar: 2,
  ofertas: 2,
  era_la_mas_barata: false,
  inadmisible: null,
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

const PESO = String.raw`\$\s?`;

describe("el resultado de una compra ágil (decisión 92)", () => {
  it("dice a quién eligieron, por cuánto, cuánto más cotizaste y tu lugar por precio", () => {
    expect(textoDelResultado(PERDIDA)).toMatch(
      new RegExp(
        `^Eligieron a BPM EVENTOS SPA por ${PESO}6\\.800\\.000\\. Tú cotizaste ${PESO}7\\.090\\.000, ${PESO}290\\.000 más, y quedaste 2° de 2 por precio\\.$`,
      ),
    );
    expect(colorDelResultado(PERDIDA)).toBe("text-gray-700");
  });

  it("ganada, en verde", () => {
    const ganada = {
      ...PERDIDA,
      estado: "ganada" as const,
      proveedor: "VALLE DEL SOL QUILLON SPA",
      monto: 7_090_000,
      lugar: 1,
    };
    expect(textoDelResultado(ganada)).toMatch(
      new RegExp(
        `^Te eligieron por ${PESO}7\\.090\\.000, 1° de 2 por precio\\.$`,
      ),
    );
    expect(colorDelResultado(ganada)).toBe("text-green-700");
  });

  it("si tenías el menor precio y eligieron a otro, lo dice en rojo: el comprador tiene que justificarlo", () => {
    const reclamable = {
      ...PERDIDA,
      mi_monto: 6_500_000,
      lugar: 1,
      era_la_mas_barata: true,
    };
    expect(textoDelResultado(reclamable)).toMatch(
      /aunque tu precio de \$\s?6\.500\.000 era el menor\. Por ley gana el menor precio: el comprador tiene que justificarlo en la orden de compra\.$/,
    );
    expect(colorDelResultado(reclamable)).toBe("text-red-700");
  });

  it("si tu oferta quedó fuera, dice por qué; sin tu oferta, solo a quién eligieron", () => {
    expect(
      textoDelResultado({
        ...PERDIDA,
        lugar: null,
        inadmisible: "No adjunta la cotización formal",
      }),
    ).toMatch(
      /^Tu oferta quedó fuera: No adjunta la cotización formal\. Eligieron a BPM EVENTOS SPA/,
    );
    expect(
      textoDelResultado({ ...PERDIDA, mi_monto: null, lugar: null }),
    ).toMatch(
      new RegExp(`^Eligieron a BPM EVENTOS SPA por ${PESO}6\\.800\\.000\\.$`),
    );
  });

  it("en el historial de la ficha dice a quién eligieron, igual para cualquier empresa", () => {
    expect(
      textoDelResultadoPublico({
        tipo: "compra_agil",
        elegidos: [
          {
            rut: "76.430.926-k",
            proveedor: "BPM EVENTOS SPA",
            monto: 6_800_000,
          },
        ],
        ofertas: [],
      }),
    ).toMatch(
      new RegExp(`^eligieron a BPM EVENTOS SPA por ${PESO}6\\.800\\.000$`),
    );
    expect(textoDelResultadoPublico(null)).toBe("salió el resultado");
  });

  it("una licitación dice a quién adjudicaron, sin lugar por precio", () => {
    const perdida = {
      ...PERDIDA,
      tipo: "licitacion" as const,
      proveedor: "Sol de Quillón",
      monto: 13_352_941,
      mi_monto: null,
      lugar: null,
      ofertas: 0,
      mas_elegidos: 0,
    };
    expect(textoDelResultado(perdida)).toMatch(
      new RegExp(`^Adjudicaron a Sol de Quillón por ${PESO}13\\.352\\.941\\.$`),
    );
    expect(
      textoDelResultado({
        ...perdida,
        estado: "ganada",
        monto: 4_000_000,
        mas_elegidos: 1,
      }),
    ).toMatch(
      new RegExp(
        `^Te adjudicaron por ${PESO}4\\.000\\.000\\. También adjudicaron a 1 más\\.$`,
      ),
    );
  });

  it("solo es nuevo lo que trae resultado y no se avisó", () => {
    const lista = [mia(3219, PERDIDA), mia(40, null)];
    expect(resultadosNuevos(lista, []).map((m) => m.id)).toEqual([3219]);
    expect(
      resultadosNuevos(lista, ["3219:perdida:76.430.926-k"]).map((m) => m.id),
    ).toEqual([]);
  });

  it("al abrir Oportunidades lo avisa una sola vez, con un aviso que queda hasta cerrarlo", () => {
    const lista = [mia(3219, PERDIDA)];
    const { rerender } = renderHook(({ l }) => useAvisoDeResultados(l), {
      initialProps: { l: lista },
    });
    expect(toast.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.warn).mock.calls[0][0]).toMatch(
      /^Perdiste «Catamarán Sudamericano de Canotaje»\. Eligieron a BPM EVENTOS SPA/,
    );
    expect(vi.mocked(toast.warn).mock.calls[0][1]).toEqual({ sticky: true });
    // La lista se vuelve a pedir: no se repite.
    rerender({ l: [...lista] });
    expect(toast.warn).toHaveBeenCalledTimes(1);
  });

  it("una ganada se avisa en verde; si tenías el menor precio y eligieron a otro, en rojo", () => {
    renderHook(() =>
      useAvisoDeResultados([
        mia(
          5171,
          {
            ...PERDIDA,
            estado: "ganada",
            proveedor: "VALLE DEL SOL QUILLON SPA",
          },
          "Alimentación autoridades",
        ),
        mia(5245, {
          ...PERDIDA,
          mi_monto: 6_500_000,
          lugar: 1,
          era_la_mas_barata: true,
        }),
      ]),
    );
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(
      /^¡Ganaste «Alimentación autoridades»! Te eligieron/,
    );
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(
      /^Perdiste «Catamarán Sudamericano de Canotaje»\. .*era el menor/,
    );
  });
});
