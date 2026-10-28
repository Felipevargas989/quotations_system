import { formatFechaEvento } from "../../utils/dates";

// LA PESTAÑA «GANADAS» (decisión 100 del doc 17, 28-10). Felipe: "No me
// gusta que las cotizaciones perdidas queden con las ganadas... las ganadas
// deberían estar en alguna parte más visible, para que no se me...". Vio
// dos dibujos y eligió la pestaña propia. Por cumplir: el servicio es hoy o
// viene, del más próximo al más lejano. Cumplidas: desde el día siguiente
// del último día del servicio. Los días los lee el motor de las bases.

/** Lo que trae «Mis licitaciones» de cada ganada desde la decisión 100. */
export interface ServicioDeLaGanada {
  /** Como lo dicen las bases. */
  texto: string;
  /** Los días del servicio (AAAA-MM-DD), de menor a mayor. Vacío si las
   *  bases no dan una fecha. */
  dias: string[];
}

export type ConServicio = { servicio?: ServicioDeLaGanada | null };

/** «Mis licitaciones» no tipa el servicio (oportunidades.service está en
 *  el tope de líneas): se lee como `ConResultado` en la decisión 92. */
const diasDe = (m: object) => (m as ConServicio).servicio?.dias ?? [];

/** Por cumplir, del próximo servicio al más lejano (las que las bases no
 *  fechan, al final); cumplidas, la más reciente primero. `hoy`, en Chile
 *  (AAAA-MM-DD). */
export const separarGanadas = <T extends object>(ganadas: T[], hoy: string) => {
  const ultimo = (m: T) => diasDe(m)[diasDe(m).length - 1] ?? null;
  const proximo = (m: T) => diasDe(m).find((d) => d >= hoy) ?? "9999-12-31";
  const cumplida = (m: T) => {
    const u = ultimo(m);
    return u !== null && u < hoy;
  };
  return {
    porCumplir: ganadas
      .filter((m) => !cumplida(m))
      .sort((a, b) => proximo(a).localeCompare(proximo(b))),
    cumplidas: ganadas
      .filter(cumplida)
      .sort((a, b) => (ultimo(b) ?? "").localeCompare(ultimo(a) ?? "")),
  };
};

/** El próximo día del servicio, en palabras: «hoy», «mañana» o «en 5
 *  días». null si las bases no lo fechan o ya pasó. */
export const cuandoEsElServicio = (
  servicio: ServicioDeLaGanada | null | undefined,
  hoy: string,
): { texto: string; dia: string; urgente: boolean } | null => {
  const dia = servicio?.dias.find((d) => d >= hoy);
  if (!dia) return null;
  const faltan = Math.round((Date.parse(dia) - Date.parse(hoy)) / 86_400_000);
  return {
    texto: faltan === 0 ? "hoy" : faltan === 1 ? "mañana" : `en ${faltan} días`,
    dia,
    urgente: faltan <= 1,
  };
};

/** Decisión 104: la IA arma «Qué ofreces» de una ganada que se postuló sin
 *  «Armar postulación», y su cotización se crea sola al terminar. */
export type ConArmando = { armando?: boolean };

/** Decisión 104: al marcarla ganada, la respuesta dice si su cotización
 *  vinculada quedó aceptada sola, con su cuota a 30 días. */
export type ConCotizacionAceptada = {
  cotizacion_aceptada?: { numero: number; vence: string } | null;
};

/** El aviso al guardar el estado de una licitación: si su cotización
 *  quedó aceptada, lo dice. */
export const avisoAlGuardar = (respuesta: unknown): string => {
  const a = (respuesta as ConCotizacionAceptada | null)?.cotizacion_aceptada;
  return a
    ? `Guardado. La cotización N° ${a.numero} quedó aceptada, con una cuota que vence el ${formatFechaEvento(a.vence, "diaYMes")}.`
    : "Guardado.";
};
