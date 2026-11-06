import type { DocumentoDeLaLista } from "../../services/documentosTributarios.service";

// QUÉ DOCUMENTO ADMITE CADA NOTA (doc 19 §9.5 y §9.21). La nota de crédito
// sale de una factura o de una nota de débito; la de débito solo anula una
// nota de crédito. Lo que admite cada documento lo dice el motor
// (`acciones`).

export type TipoDeNota = "nota_credito" | "nota_debito";

export const admiteLaNota = (tipo: TipoDeNota, d: DocumentoDeLaLista) =>
  tipo === "nota_credito"
    ? (d.tipo === 33 || d.tipo === 56) &&
      (d.acciones.anular || d.acciones.rebajar || d.acciones.corregir)
    : d.tipo === 61 && d.acciones.anular;
