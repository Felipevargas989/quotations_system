import { DateTime } from "luxon";

/**
 * FECHAS — la pieza de la casa
 *
 * Acá vive UNA sola regla, la que más cara ha salido en este sistema:
 * en Eventia conviven dos cosas que parecen lo mismo y no lo son.
 *
 *   · FECHA DE EVENTO  → "el almuerzo es el 14 de agosto". Se guarda a
 *     medianoche UTC y NO tiene hora. Hay que leerla en UTC. Si se lee
 *     en hora chilena se corre un día hacia atrás: es el bug de la
 *     cotización #423, que decía 13-17 por fuera y 14-18 por dentro.
 *
 *   · MOMENTO → "el pago se registró el 13 a las 21:40". Es un instante
 *     real. Hay que leerlo en hora chilena. Si se lee en UTC, todo lo
 *     que pase después de las 20:00 aparece con la fecha del día
 *     siguiente.
 *
 * Por eso son DOS funciones separadas y no una con un interruptor:
 * con un interruptor, olvidarlo es silencioso y el error solo aparece
 * de noche. Separadas, hay que elegir a propósito.
 *
 * Antes de esto la utilidad solo sabía devolver "13/08/2026". Apenas
 * alguien necesitaba "jueves 13 de agosto" se lo escribía a mano, y ahí
 * nacía la copia — con el bug adentro. Por eso ahora lleva formatos.
 */

/** La zona donde opera Eventia. "Hoy" se decide acá, no en Londres. */
export const ZONA_CHILE = "America/Santiago";

/**
 * Los largos disponibles. Si hace falta uno nuevo, se agrega ACÁ —
 * no se escribe a mano en la pantalla.
 */
export type FormatoFecha =
  /** 13/08/2026 */
  | "corto"
  /** 13 ago 2026 */
  | "medio"
  /** jueves 13 de agosto de 2026 */
  | "largo"
  /** jueves 13 de agosto (sin el año: para cuando ya se ve arriba) */
  | "diaYMes"
  /** 13 de agosto de 2026 (sin el día de la semana) */
  | "largoSinDia"
  /** 13 ago */
  | "diaMes";

const MOLDES: Record<FormatoFecha, string> = {
  corto: "dd/MM/yyyy",
  medio: "dd LLL yyyy",
  largo: "cccc d 'de' LLLL 'de' yyyy",
  diaYMes: "cccc d 'de' LLLL",
  largoSinDia: "d 'de' LLLL 'de' yyyy",
  diaMes: "d LLL",
};

const pintar = (
  dt: DateTime,
  formato: FormatoFecha,
  siNoHay: string,
): string => {
  if (!dt.isValid) return siNoHay;
  return dt.setLocale("es-CL").toFormat(MOLDES[formato]);
};

const aDateTime = (fecha: string | Date, zona: string): DateTime =>
  typeof fecha === "string"
    ? DateTime.fromISO(fecha, { zone: zona })
    : DateTime.fromJSDate(fecha, { zone: zona });

/**
 * FECHA DE EVENTO — la del almuerzo, la del alojamiento, la del evento.
 * Se lee en UTC porque así se guarda. NO usar para momentos.
 */
export const formatFechaEvento = (
  fecha: string | Date | null | undefined,
  formato: FormatoFecha = "corto",
  siNoHay = "—",
): string => {
  if (!fecha) return siNoHay;
  try {
    return pintar(aDateTime(fecha, "utc"), formato, siNoHay);
  } catch {
    return siNoHay;
  }
};

/**
 * MOMENTO — cuándo se creó, cuándo se pagó, cuándo se provisionó.
 * Se lee en hora chilena porque es un instante real. NO usar para
 * fechas de evento.
 */
export const formatMomento = (
  fecha: string | Date | null | undefined,
  formato: FormatoFecha = "corto",
  siNoHay = "—",
): string => {
  if (!fecha) return siNoHay;
  try {
    return pintar(aDateTime(fecha, ZONA_CHILE), formato, siNoHay);
  } catch {
    return siNoHay;
  }
};

/**
 * QUÉ DÍA ES HOY, en Chile — como "2026-08-13".
 *
 * El atajo `new Date().toISOString().split("T")[0]` NO sirve: entrega
 * la fecha de Londres, así que entre las 21:00 y la medianoche hora
 * chilena devuelve el día siguiente. Con eso, un evento de hoy se cae
 * de los cálculos y el formulario público bloquea el día equivocado.
 */
export const hoyEnChile = (): string =>
  DateTime.now().setZone(ZONA_CHILE).toISODate() as string;

/**
 * La fecha de hoy en Chile, corrida N días. Sirve para los mínimos de
 * los selectores de fecha: `hoyEnChileMas(2)` es pasado mañana.
 */
export const hoyEnChileMas = (dias: number): string =>
  DateTime.now().setZone(ZONA_CHILE).plus({ days: dias }).toISODate() as string;

/**
 * Nombre viejo, se mantiene para no romper las 5 pantallas que ya lo
 * llaman. Es exactamente formatFechaEvento en formato corto.
 */
export const formatISOUTCDateToString = (eventDate: string | Date): string => {
  try {
    return formatFechaEvento(eventDate, "corto", String(eventDate));
  } catch (error) {
    console.error("Error formatting date:", error);
    return eventDate.toString();
  }
};
