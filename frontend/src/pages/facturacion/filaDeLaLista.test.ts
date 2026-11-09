import { describe, expect, it } from "vitest";
import type { DocumentoDeLaLista } from "../../services/documentosTributarios.service";
import { condicionDePago } from "./filaDeLaLista";

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
