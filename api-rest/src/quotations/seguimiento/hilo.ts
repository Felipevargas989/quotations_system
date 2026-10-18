// DÓNDE QUEDA EL BORRADOR (doc 18, sección 3).
//
// Felipe, 17-10-2026: "se genere idealmente en el hilo donde está la
// conversación; si no está en el hilo, que se cree un nuevo correo". Las
// mismas reglas de la skill `correos-cotizaciones-vds` (función 2): el
// último mensaje real decide si es seguimiento o respuesta, y un hilo que
// ya tiene un borrador no se toca.

import { ddmm, fechaEnChile } from './elegibles';
import type { MensajeDelBuzon } from './outlook';

export type DecisionDelHilo =
  /** El último correo es de la casa: seguimiento dirigido al cliente. */
  | {
      modo: 'seguimiento';
      buzon: string;
      mensaje: MensajeDelBuzon;
      hilo: MensajeDelBuzon[];
    }
  /** El último es del cliente y el equipo ya lo vio (hay una gestión
   *  después): se le responde a todos en su hilo. */
  | {
      modo: 'responder';
      buzon: string;
      mensaje: MensajeDelBuzon;
      hilo: MensajeDelBuzon[];
    }
  /** No hay hilo con el cliente en ningún buzón: correo nuevo. */
  | { modo: 'nuevo'; buzon: string }
  | { modo: 'saltar'; motivo: string };

export function decidirHilo(p: {
  /** Lo encontrado en cada buzón, en el orden en que se buscan. */
  encontrados: Array<{ buzon: string; mensajes: MensajeDelBuzon[] }>;
  esDeLaCasa: (correo: string) => boolean;
  /** Cuándo se anotó la última gestión en la bitácora (ISO). */
  ultimaGestion: string | null;
  /** Donde va el correo nuevo si no hay hilo (contacto@). */
  buzonParaNuevo: string;
}): DecisionDelHilo {
  const conAlgo = p.encontrados.find((e) => e.mensajes.length > 0);
  if (!conAlgo) return { modo: 'nuevo', buzon: p.buzonParaNuevo };

  // El hilo es la conversación del mensaje más reciente con el cliente.
  const porFecha = (a: MensajeDelBuzon, b: MensajeDelBuzon) =>
    Date.parse(b.fecha) - Date.parse(a.fecha);
  const masNuevo = [...conAlgo.mensajes].sort(porFecha)[0];
  const hilo = conAlgo.mensajes
    .filter((m) => m.hilo === masNuevo.hilo)
    .sort(porFecha);

  if (hilo.some((m) => m.borrador)) {
    return {
      modo: 'saltar',
      motivo: `ya hay un borrador en el hilo de ${conAlgo.buzon}.`,
    };
  }

  const ultimo = hilo[0];
  if (!p.esDeLaCasa(ultimo.de)) {
    const nuevoDesdeLaGestion =
      !p.ultimaGestion ||
      Date.parse(ultimo.fecha) > Date.parse(p.ultimaGestion);
    if (nuevoDesdeLaGestion) {
      const dia = ddmm(fechaEnChile(new Date(ultimo.fecha)));
      return {
        modo: 'saltar',
        motivo: `el cliente escribió el ${dia} («${ultimo.asunto}») después de la última gestión: requiere tu respuesta.`,
      };
    }
    return { modo: 'responder', buzon: conAlgo.buzon, mensaje: ultimo, hilo };
  }
  return { modo: 'seguimiento', buzon: conAlgo.buzon, mensaje: ultimo, hilo };
}

/** Las copias de un seguimiento: quienes venían en el último correo de la
 *  casa, menos la casa y el destinatario principal. */
export const copiasDelHilo = (
  mensaje: MensajeDelBuzon,
  destinatarios: string[],
  esDeLaCasa: (correo: string) => boolean,
): string[] =>
  [...new Set([...mensaje.para, ...mensaje.cc])].filter(
    (c) => c && !esDeLaCasa(c) && !destinatarios.includes(c),
  );

const momento = (m: MensajeDelBuzon) => Date.parse(m.fecha);

/** Cuántos seguimientos de la casa van sin respuesta en el hilo, contando
 *  el que acaba de salir (doc 18 §9). La skill de correos: "tras dos
 *  seguimientos sin respuesta, el paso siguiente es teléfono".
 *
 *  El ancla es lo último que pasó de verdad: el último correo del cliente
 *  o el último envío de una cotización (el correo de Eventia, o uno de la
 *  casa con adjuntos: el PDF). Los seguimientos son los correos de la casa
 *  después del ancla. Medido el 17-10 con hilos reales: a la 477 le
 *  escribimos el 23-09 y de nuevo hoy sin que contestara (2); la 578 pidió
 *  el 02-10 y la cotización salió el 11-10 (1). */
export function seguimientosSinRespuesta(p: {
  mensajes: MensajeDelBuzon[];
  esDeLaCasa: (correo: string) => boolean;
  esDeEventia: (correo: string) => boolean;
}): number {
  const reales = p.mensajes.filter((m) => !m.borrador && m.fecha);
  const ancla = Math.max(
    -Infinity,
    ...reales
      .filter((m) => !p.esDeLaCasa(m.de) || p.esDeEventia(m.de) || m.adjuntos)
      .map(momento),
  );
  return reales.filter(
    (m) => p.esDeLaCasa(m.de) && !p.esDeEventia(m.de) && momento(m) > ancla,
  ).length;
}

/** Si el borrador de la IA se borró: el primer correo de la casa que salió
 *  en el hilo después de dejarlo. Ese fue el seguimiento, escrito a mano. */
export function otroEnvioEnElHilo(p: {
  mensajes: MensajeDelBuzon[];
  /** Cuándo quedó el borrador (ISO). */
  desde: string;
  esDeLaCasa: (correo: string) => boolean;
  esDeEventia: (correo: string) => boolean;
}): MensajeDelBuzon | null {
  const desde = Date.parse(p.desde);
  return (
    p.mensajes
      .filter(
        (m) =>
          !m.borrador &&
          p.esDeLaCasa(m.de) &&
          !p.esDeEventia(m.de) &&
          momento(m) > desde,
      )
      .sort((a, b) => momento(a) - momento(b))[0] ?? null
  );
}
