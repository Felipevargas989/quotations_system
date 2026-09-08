import type { Asignacion, NominaDetalle } from "../../types/people.types";

/**
 * QUÉ PAGÓ UNA NÓMINA, por evento y por día de staff (Felipe, 08-09):
 * "más que el detalle de las personas, deberían ser qué eventos y días
 * están pagados ahí… el detalle de cada nómina vive correctamente en
 * la pestaña Nómina". Es la vista del Histórico: una fila por concepto
 * con cuánta gente, jornadas, propinas y cuánto de eso ya se marcó
 * pagado. El pago se marca por PERSONA (jornada_paid / propina_paid),
 * así que el "pagado" de un concepto es la suma de lo que sus personas
 * ya cobraron.
 */
export interface PorConcepto {
  llave: string;
  /** NULL = día de staff (sin evento). */
  quotation_id: string | null;
  day: string | null;
  personas: number;
  totalJornada: number;
  totalPropina: number;
  pagadoJornada: number;
  pagadoPropina: number;
  /** La última fecha de pago entre lo ya pagado del concepto. */
  pagadoEl: string | null;
}

export type EstadoDelConcepto = "pagado" | "parcial" | "pendiente";

export const estadoDelConcepto = (c: PorConcepto): EstadoDelConcepto => {
  const pagado = c.pagadoJornada + c.pagadoPropina;
  const total = c.totalJornada + c.totalPropina;
  if (pagado >= total) return "pagado";
  return pagado > 0 ? "parcial" : "pendiente";
};

export const porConceptoDe = (nomina: NominaDetalle): PorConcepto[] => {
  const m = new Map<string, PorConcepto>();
  const personasDe = new Map<string, Set<number>>();
  const de = (a: Asignacion): PorConcepto => {
    const llave = a.quotation_id ? `ev:${a.quotation_id}` : `dia:${a.day ?? ""}`;
    if (!m.has(llave)) {
      m.set(llave, {
        llave,
        quotation_id: a.quotation_id,
        day: a.quotation_id ? null : a.day,
        personas: 0,
        totalJornada: 0,
        totalPropina: 0,
        pagadoJornada: 0,
        pagadoPropina: 0,
        pagadoEl: null,
      });
      personasDe.set(llave, new Set());
    }
    const fila = m.get(llave)!;
    if (a.person_id != null) {
      personasDe.get(llave)!.add(a.person_id);
      fila.personas = personasDe.get(llave)!.size;
    }
    return fila;
  };
  const pagoDe = (a: Asignacion) =>
    nomina.pagos.find((p) => p.person_id === a.person_id);
  const sello = (fila: PorConcepto, fecha: string | null) => {
    if (fecha && (!fila.pagadoEl || fecha > fila.pagadoEl)) fila.pagadoEl = fecha;
  };
  for (const a of nomina.jornadas) {
    const fila = de(a);
    const monto = Number(a.amount ?? 0);
    fila.totalJornada += monto;
    const pago = pagoDe(a);
    if (pago?.jornada_paid) {
      fila.pagadoJornada += monto;
      sello(fila, pago.paid_at);
    }
  }
  for (const a of nomina.propinas) {
    const fila = de(a);
    const monto = Number(a.tip_amount ?? 0);
    fila.totalPropina += monto;
    const pago = pagoDe(a);
    if (pago?.propina_paid) {
      fila.pagadoPropina += monto;
      sello(fila, pago.paid_at);
    }
  }
  // Eventos primero (en el orden en que vienen), después los días de
  // staff del más nuevo al más viejo.
  return [...m.values()].sort((a, b) => {
    if (!!a.quotation_id !== !!b.quotation_id) return a.quotation_id ? -1 : 1;
    return (b.day ?? "").localeCompare(a.day ?? "");
  });
};
