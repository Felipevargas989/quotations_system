import type { Asignacion } from "../../types/people.types";

// LOS EVENTOS DE LA SÁBANA Y LO QUE CUESTA EL DÍA (Felipe, 09-11-2026)
//
// Camila empezó a poner la gente de los eventos en Personal Staff. Medido
// ese día: un evento sin sillas en Gestión no aparecía en la sábana (entre
// el 11-10 y el 30-11 había 13 así, como la #460 del 29-10), y el único
// «+» a la vista era el de Staff. De ahí salieron las reglas de este
// archivo: todo evento del rango se ve, tenga o no gente; cada día del
// evento lleva su «+», y también hasta 4 días antes y 4 después
// (preparativos y desarme, ligados al evento y a su costo). Y el resumen
// del día suma lo que cuesta cada persona ese día.

/** Hasta cuántos días antes y después del evento se le puede poner gente
 *  desde la sábana. Es el mismo tope que Gestión usa para agregar días
 *  (`TOPE_DIAS_EXTRA` de GrillaPersonal y EventResourcesSection). */
export const TOPE_DIAS_EXTRA = 4;

const DIA_MS = 86_400_000;

const sumarDias = (isoDia: string, n: number) =>
  new Date(new Date(`${isoDia}T00:00:00Z`).getTime() + n * DIA_MS)
    .toISOString()
    .slice(0, 10);

export interface FechasDeEvento {
  readonly inicio: string | null;
  readonly termino: string | null;
}

/** El último día del evento: sin término, el evento dura un día
 *  (doc 10 §10.8). */
const finDe = (e: FechasDeEvento) =>
  e.inicio && e.termino && e.termino > e.inicio ? e.termino : e.inicio;

/** Los días entre dos fechas, ambas incluidas. */
const diasEntre = (desde: string, hasta: string) => {
  const salida = new Set<string>();
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) salida.add(d);
  return salida;
};

/** Los días que dura un evento, uno por uno. */
export const diasDe = (e: FechasDeEvento): Set<string> => {
  const fin = finDe(e);
  return e.inicio && fin ? diasEntre(e.inicio, fin) : new Set<string>();
};

/** Los días en que la sábana deja poner gente de un evento: los suyos y
 *  hasta `tope` días antes y después. */
export const diasConMas = (
  e: FechasDeEvento,
  tope: number = TOPE_DIAS_EXTRA,
): Set<string> => {
  const fin = finDe(e);
  return e.inicio && fin
    ? diasEntre(sumarDias(e.inicio, -tope), sumarDias(fin, tope))
    : new Set<string>();
};

/** ¿El evento cae (aunque sea un día) dentro del rango visible? */
export const eventoEnRango = (
  e: FechasDeEvento,
  desde: string,
  hasta: string,
): boolean => {
  const fin = finDe(e);
  return !!e.inicio && !!fin && e.inicio <= hasta && fin >= desde;
};

/** Los eventos que tienen ese día entre sus fechas: los que nombra la
 *  pregunta al poner a alguien en Staff. */
export const eventosDelDia = <T extends FechasDeEvento>(
  eventos: readonly T[],
  dia: string,
): T[] => eventos.filter((e) => diasDe(e).has(dia));

/** Lo que cuesta esa jornada ese día, o null si no suma nada.
 *  - La planta va en blanco: su sueldo la cubre. Solo si se le puso un
 *    adicional, ese monto aparece y suma (Felipe, 09-11-2026).
 *  - El freelance, su monto acordado.
 *  - La silla vacía, su valor estimado: lo que falta por conseguir
 *    también cuesta (doc 10 §2, «la silla vacía vale lo que vale su
 *    cargo»). */
export const pagoDelDia = (
  a: Pick<Asignacion, "kind" | "amount">,
): number | null => {
  const monto = Number(a.amount ?? 0);
  if (!Number.isFinite(monto) || monto <= 0) return null;
  return monto;
};

/** Lo que cuesta un grupo de jornadas ese día. Supabase entrega los
 *  montos como texto: por eso el `Number` de `pagoDelDia`. */
export const costoDeLaGente = (
  gente: readonly Pick<Asignacion, "kind" | "amount">[],
): number => gente.reduce((t, a) => t + (pagoDelDia(a) ?? 0), 0);

/** El peso chileno sin decimales: "$25.000". */
export const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
