import { describe, expect, it } from "vitest";
import type { DocumentoDeLaLista } from "../../services/documentosTributarios.service";
import { condicionDePago, porNumero } from "./filaDeLaLista";

// LA LÍNEA DE ABAJO DEL ESTADO (doc 19 §9.22 y §9.43): la condición de pago
// de la factura y, al contado, con qué se pagó; la boleta, su medio de pago.

const doc = (d: Partial<DocumentoDeLaLista>) =>
  ({
    tipo: 33,
    forma_de_pago: null,
    vencimiento: null,
    plazo_dias: null,
    medio_de_pago: null,
    ...d,
  }) as DocumentoDeLaLista;

describe("la condición de pago en la lista", () => {
  it("al contado, con su medio de pago (§9.43)", () => {
    expect(
      condicionDePago(doc({ forma_de_pago: 1, medio_de_pago: "debito" })),
    ).toBe("Contado · Débito");
    expect(condicionDePago(doc({ forma_de_pago: 1 }))).toBe("Contado");
  });

  it("a crédito, sus días y su vencimiento", () => {
    expect(
      condicionDePago(
        doc({ forma_de_pago: 2, vencimiento: "2026-12-06", plazo_dias: 30 }),
      ),
    ).toBe("Crédito 30 días · vence 06-12");
  });

  it("la boleta dice con qué se pagó; la de antes, nada", () => {
    expect(condicionDePago(doc({ tipo: 39, medio_de_pago: "efectivo" }))).toBe(
      "Efectivo",
    );
    expect(condicionDePago(doc({ tipo: 39 }))).toBeNull();
  });
});

// EL ORDEN POR NÚMERO (§9.44; Felipe, 09-11: *"ordénalo por número, es más
// intuitivo"*). Los casos de producción del 08 y el 09-11.
describe("la lista por número", () => {
  const d = (
    id: number,
    tipo: number,
    folio: number | null,
    fecha_emision: string | null = "2026-11-08",
  ) => ({ id, tipo, folio, fecha_emision });
  const nombres = (docs: ReturnType<typeof d>[]) =>
    porNumero(docs).map((x) => `${x.tipo === 39 ? "B" : "F"}${x.folio ?? "?"}`);

  it("la 388 fechada el 30-11 queda bajo la 389, no arriba", () => {
    expect(
      nombres([
        d(29, 33, 387),
        d(30, 33, 388, "2026-11-30"),
        d(32, 33, 389, "2026-11-09"),
      ]),
    ).toEqual(["F389", "F388", "F387"]);
  });

  it("lo traído después no salta: la 374 queda bajo la 381", () => {
    expect(
      nombres([
        d(1, 33, 381),
        d(3, 33, 382),
        d(7, 33, 374, "2026-10-30"),
        d(23, 33, 376, "2026-10-24"),
      ]),
    ).toEqual(["F382", "F381", "F376", "F374"]);
  });

  it("cada tipo por su número, y entre tipos, el que salió después", () => {
    expect(
      nombres([
        d(1, 33, 389),
        d(2, 39, 45001),
        d(3, 39, 45002),
        d(4, 33, 390),
        d(5, 39, 45003),
      ]),
    ).toEqual(["B45003", "F390", "B45002", "B45001", "F389"]);
  });

  it("lo que espera «Comprobar», sin N° o sin fecha, primero", () => {
    expect(
      nombres([d(1, 33, 389), d(2, 33, null, null), d(3, 33, 390, null)]),
    ).toEqual(["F390", "F?", "F389"]);
  });
});
