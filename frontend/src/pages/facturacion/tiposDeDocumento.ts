// Lo que se puede emitir desde «Nuevo documento» (doc 19 §9.21 y §9.22),
// con su nombre: la ventana que pregunta y el título de cada pantalla.

export type TipoNuevo =
  | "factura"
  | "boleta"
  | "nota_credito"
  | "nota_debito"
  | "traer";

export const NOMBRE_DEL_NUEVO: Record<TipoNuevo, string> = {
  factura: "Factura electrónica",
  boleta: "Boleta electrónica",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  // §9.36: la emitida fuera de Eventia, para anularla desde acá.
  traer: "Traer factura emitida fuera de Eventia",
};
