// EL PORQUÉ DE UN DESCARTE (decisión 113 del doc 17): los motivos, sin
// llamar a nadie. La llamada al motor, `ponerMotivoDelDescarte`, está con
// las demás de Oportunidades en oportunidades.service.ts.

export type MotivoDelDescarte =
  | "muy_chica"
  | "muy_lejos"
  | "no_es_lo_mio"
  | "no_alcanzo"
  | "otro";

export const MOTIVOS_DEL_DESCARTE: ReadonlyArray<{
  valor: MotivoDelDescarte;
  etiqueta: string;
}> = [
  { valor: "muy_chica", etiqueta: "Muy chica" },
  { valor: "muy_lejos", etiqueta: "Muy lejos" },
  { valor: "no_es_lo_mio", etiqueta: "No es lo mío" },
  { valor: "no_alcanzo", etiqueta: "No alcanzo" },
  { valor: "otro", etiqueta: "Otro" },
];
