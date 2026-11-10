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

/** EN CASCADA (Felipe, 09-11-2026: "debería mostrarme del que se va a
 *  realizar antes al último, cosa de irlo viendo en cascada y no así como
 *  saltados"). Antes la sábana los ordenaba por el texto "#N · cliente",
 *  o sea por número de cotización. Ahora: primero el que parte antes; si
 *  parten el mismo día, el que termina antes; y después el número. Un
 *  evento que no está en la lista (sin fecha) va al final. */
export interface EventoParaOrdenar extends FechasDeEvento {
  readonly numero: number;
}

export const compararEventos = (
  a: EventoParaOrdenar | undefined,
  b: EventoParaOrdenar | undefined,
): number => {
  const SIN_FECHA = "9999-12-31";
  const ia = a?.inicio ?? SIN_FECHA;
  const ib = b?.inicio ?? SIN_FECHA;
  if (ia !== ib) return ia < ib ? -1 : 1;
  const fa = (a && finDe(a)) ?? SIN_FECHA;
  const fb = (b && finDe(b)) ?? SIN_FECHA;
  if (fa !== fb) return fa < fb ? -1 : 1;
  return (a?.numero ?? Number.MAX_SAFE_INTEGER) - (b?.numero ?? Number.MAX_SAFE_INTEGER);
};

/** LA VISTA DE LA SÁBANA (Felipe, 09-11-2026: "¿y si vemos solo 2 semanas
 *  adelante por defecto?", "y un botón para ver los próximos 30 días" y
 *  "las flechas que avancen de 1 en 1"). Reemplaza la vista mensual fija del
 *  15-08. Cada vez que se entra parte en dos semanas. */
export type VistaDeLaSabana = "dos-semanas" | "treinta-dias";

/** Cuántos días se ven en cada vista. */
export const DIAS_DE_LA_VISTA: Record<VistaDeLaSabana, number> = {
  "dos-semanas": 14,
  "treinta-dias": 30,
};

/** Cuántos días mueven las flechas: una semana. */
export const PASO_DE_LAS_FLECHAS = 7;

/** Cuántos días de datos se piden: al menos 28, porque esa es la clave de
 *  caché que la sábana comparte con la ficha de la persona (mapa 07, zona
 *  de riesgo 14). Con la misma clave, lo que se cambia en un lado se ve al
 *  instante en el otro. */
export const diasDeDatos = (vista: VistaDeLaSabana): number =>
  Math.max(DIAS_DE_LA_VISTA[vista], 28);

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
