import type {
  CambioDeTipo,
  Persona,
  ResultadoDelCambio,
  ResultadoDelOrigen,
} from "../../types/people.types";
import {
  etiquetaTipoPersona,
  type TipoPersona,
} from "../../utils/estadoPersona";

/**
 * LA VENTANA «DESDE» Y EL HISTORIAL DE TIPO (doc 10 §12, 17-11-2026).
 *
 * El tipo que rige hoy ya llega del motor en `default_kind`. Acá solo se
 * lee el historial para lo que la pantalla dice: «Pasa a planta el 01-11»
 * y los textos de la ventana. Funciones puras, con su prueba.
 */

const momento = (c: CambioDeTipo) => Date.parse(c.registrado_en ?? "") || 0;

/** Del más nuevo al más viejo: así se lee el historial en la ficha. */
export const historialReciente = (
  historial: readonly CambioDeTipo[] | null | undefined,
): CambioDeTipo[] =>
  [...(historial ?? [])].sort(
    (a, b) =>
      b.desde.slice(0, 10).localeCompare(a.desde.slice(0, 10)) ||
      momento(b) - momento(a),
  );

/** El próximo cambio que todavía no rige (el más cercano). */
export const proximoCambio = (
  persona: Pick<Persona, "historial_tipo">,
  hoy: string,
): CambioDeTipo | null => {
  // El más cercano; con el mismo día, el último que se registró.
  const futuros = (persona.historial_tipo ?? [])
    .filter((c) => c.desde.slice(0, 10) > hoy)
    .sort(
      (a, b) =>
        a.desde.slice(0, 10).localeCompare(b.desde.slice(0, 10)) ||
        momento(b) - momento(a),
    );
  return futuros[0] ?? null;
};

/** "2026-11-01" → "01-11". */
export const diaYMes = (dia: string) =>
  dia.slice(0, 10).split("-").reverse().slice(0, 2).join("-");

/** "2026-11-01" → "01-11-2026". */
export const fechaChilena = (dia: string) =>
  dia.slice(0, 10).split("-").reverse().join("-");

/** «Pasa a planta el 01-11». */
export const textoDelProximo = (cambio: CambioDeTipo) =>
  `Pasa a ${etiquetaTipoPersona(cambio.kind).toLowerCase()} el ${diaYMes(cambio.desde)}`;

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Lo que la ventana dice con la cuenta del motor: qué pasa con sus días
 *  y, en ámbar, cuántos quedan sin tocar. */
export const textosDeLaVentana = (
  r: ResultadoDelCambio,
): { lineas: string[]; aviso: string | null } => {
  const lineas: string[] = [];
  const fecha = diaYMes(r.desde);
  const nuevo = etiquetaTipoPersona(r.kind).toLowerCase();

  if (r.futuro) {
    lineas.push(
      `Sigue como ${etiquetaTipoPersona(r.anterior).toLowerCase()} hasta ese día.`,
    );
  }
  if (r.kind === "planta") {
    if (r.aPlanta > 0) {
      lineas.push(
        `${dias(r.aPlanta)} de staff desde el ${fecha} pasan a ${nuevo}.`,
      );
    }
    lineas.push(
      r.futuro
        ? `Desde el ${fecha}, el sistema le carga sus días de planta.`
        : "Desde hoy, el sistema le carga sus días de planta.",
    );
  } else {
    if (r.quitan > 0) {
      lineas.push(
        `Se le quitan ${dias(r.quitan)} de planta que puso el sistema.`,
      );
    }
    if (r.aFreelance > 0) {
      lineas.push(
        `${dias(r.aFreelance)} que ya trabajó quedan como freelance, esperando su monto.`,
      );
    }
    if (r.quitan === 0 && r.aFreelance === 0) {
      lineas.push(`Desde el ${fecha} deja de cargarse como planta.`);
    }
  }

  const aviso =
    r.sinTocar === 1
      ? "1 día queda sin tocar: ya está en una liquidación o nómina."
      : r.sinTocar > 1
        ? `${dias(r.sinTocar)} quedan sin tocar: ya están en una liquidación o nómina.`
        : null;
  return { lineas, aviso };
};

/**
 * LA LÍNEA DE ORIGEN (doc 10 §12.1, 19-11-2026). Felipe: "la gente de
 * planta toda está (a excepción de Sofía) desde que empezamos con el
 * sistema". El historial nunca se ve vacío: al final va el tipo que tenía
 * antes del primer cambio (sin historial, el de hoy), «desde que empezó en
 * el sistema». Se deriva; no se escribe nada en la base.
 */
export const lineaDeOrigen = (
  persona: Pick<Persona, "default_kind" | "historial_tipo">,
): { kind: TipoPersona; hasta: string | null } => {
  const cambios = historialReciente(persona.historial_tipo);
  const primero = cambios[cambios.length - 1];
  if (primero) return { kind: primero.anterior, hasta: primero.desde };
  return {
    kind: persona.default_kind === "planta" ? "planta" : "freelance",
    hasta: null,
  };
};

/** Lo que la ventana dice al anotar desde cuándo: qué pasa con sus días
 *  desde esa fecha y que los de antes quedan como están. Sin alarma: el
 *  único ámbar es lo que está en una nómina. */
export const textosDelOrigen = (
  r: ResultadoDelCambio & Partial<Pick<ResultadoDelOrigen, "antes">>,
): { lineas: string[]; aviso: string | null } => {
  const fecha = diaYMes(r.desde);
  const tipo = etiquetaTipoPersona(r.kind).toLowerCase();
  const lineas: string[] = [];
  if (r.aPlanta > 0) {
    lineas.push(
      `${dias(r.aPlanta)} de staff desde el ${fecha} ${r.aPlanta === 1 ? "pasa" : "pasan"} a planta.`,
    );
  }
  if (r.quitan > 0) {
    lineas.push(
      `Se le ${r.quitan === 1 ? "quita" : "quitan"} ${dias(r.quitan)} de planta que puso el sistema.`,
    );
  }
  if (r.aFreelance > 0) {
    lineas.push(
      `${dias(r.aFreelance)} desde el ${fecha} ${r.aFreelance === 1 ? "queda" : "quedan"} como freelance.`,
    );
  }
  if (r.aPlanta + r.quitan + r.aFreelance === 0) {
    lineas.push(`Sus días desde el ${fecha} ya están como ${tipo}.`);
  }
  const antes = r.antes ?? 0;
  if (antes > 0) {
    lineas.push(
      `${dias(antes)} de antes del ${fecha} ${antes === 1 ? "queda" : "quedan"} como ${antes === 1 ? "está" : "están"}.`,
    );
  }
  return { lineas, aviso: textosDeLaVentana(r).aviso };
};
