import { describe, expect, it } from "vitest";
import type { DocumentoDeLaLista } from "../../services/documentosTributarios.service";
import { admiteLaNota } from "./admiteLaNota";

// LA NOTA DE «NUEVO DOCUMENTO» (doc 19 §9.21): cada nota modifica un
// documento. La de crédito sale de una factura (o de una nota de débito);
// la de débito solo anula una nota de crédito. Lo que admite cada uno lo
// dice el motor.

const doc = (
  tipo: number,
  acciones: Partial<DocumentoDeLaLista["acciones"]>,
): DocumentoDeLaLista =>
  ({
    tipo,
    acciones: {
      anular: false,
      rebajar: false,
      corregir: false,
      comprobar: false,
      pedirPdf: false,
      ...acciones,
    },
  }) as DocumentoDeLaLista;

describe("Qué documento admite cada nota", () => {
  it("la de crédito: una factura que se puede anular, rebajar o corregir", () => {
    expect(admiteLaNota("nota_credito", doc(33, { rebajar: true }))).toBe(true);
    expect(admiteLaNota("nota_credito", doc(33, {}))).toBe(false);
    expect(admiteLaNota("nota_credito", doc(39, { anular: true }))).toBe(false);
  });

  it("la de débito: solo anular una nota de crédito", () => {
    expect(admiteLaNota("nota_debito", doc(61, { anular: true }))).toBe(true);
    expect(admiteLaNota("nota_debito", doc(33, { anular: true }))).toBe(false);
  });
});
