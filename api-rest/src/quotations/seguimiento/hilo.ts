// DÓNDE QUEDA EL BORRADOR (doc 18, sección 3).
//
// Felipe, 17-10-2026: "se genere idealmente en el hilo donde está la
// conversación; si no está en el hilo, que se cree un nuevo correo". Las
// mismas reglas de la skill `correos-cotizaciones-vds` (función 2): el
// último mensaje real decide si es seguimiento o respuesta, y un hilo que
// ya tiene un borrador no se toca.
//
// Y SIEMPRE el hilo de la cotización (Felipe, 18-10: "que prefiera el hilo
// de la cotización siempre"): el 17-10 la 493 quedó escrita en un hilo de
// FACTURA de un evento anterior, porque era el correo más reciente con ese
// contacto. Si ningún buzón tiene el hilo de la cotización, va un correo
// nuevo; nunca otro hilo.

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
  /** No hay hilo de la cotización en ningún buzón: correo nuevo. */
  | { modo: 'nuevo'; buzon: string }
  | { modo: 'saltar'; motivo: string };

const porFecha = (a: MensajeDelBuzon, b: MensajeDelBuzon) =>
  Date.parse(b.fecha) - Date.parse(a.fecha);

/** Los números de cotización que nombra un asunto: «N° 477», «#535»,
 *  «nro. 12». */
const NUMERO_EN_ASUNTO =
  /(?:n\s*[°º.]|#|nro\.?|n[uú]mero)\s*:?\s*(\d{2,6})(?!\d)/gi;
const ASUNTO_DE_COTIZACION = /cotiz|presupuesto/i;

/** El hilo de la cotización entre los mensajes de un buzón, del más nuevo
 *  al más viejo, o null si no hay. Es de la cotización el hilo cuyo asunto
 *  nombra su N° (gana siempre), o el que habla de cotización (o trae el
 *  correo de «Enviar cotización» de Eventia) sin nombrar OTRO número y con
 *  movimiento después de creada la cotización. Medido el 18-10 con las 10
 *  de ese día: 8 quedan en el mismo hilo; la 493 (hilo de factura) y la 508
 *  (su único hilo era el de la #535, otra cotización) pasan a correo nuevo. */
export function hiloDeLaCotizacion(p: {
  mensajes: MensajeDelBuzon[];
  numero: number;
  /** Cuándo se creó la cotización (ISO). */
  creada: string | null;
  esDeEventia: (correo: string) => boolean;
}): MensajeDelBuzon[] | null {
  const porHilo = new Map<string, MensajeDelBuzon[]>();
  for (const m of p.mensajes) {
    porHilo.set(m.hilo, [...(porHilo.get(m.hilo) ?? []), m]);
  }
  const creada = p.creada ? Date.parse(p.creada) : null;
  let mejor: { puntaje: number; ultimo: number; hilo: MensajeDelBuzon[] } = {
    puntaje: 0,
    ultimo: 0,
    hilo: [],
  };
  for (const hilo of porHilo.values()) {
    const asuntos = hilo.map((m) => m.asunto).join(' | ');
    const numeros = new Set(
      [...asuntos.matchAll(NUMERO_EN_ASUNTO)].map((x) => Number(x[1])),
    );
    const ultimo = Math.max(...hilo.map((m) => Date.parse(m.fecha)));
    let puntaje = 0;
    if (numeros.has(p.numero)) puntaje = 2;
    else if (
      numeros.size === 0 &&
      (ASUNTO_DE_COTIZACION.test(asuntos) ||
        hilo.some((m) => p.esDeEventia(m.de))) &&
      (creada === null || ultimo >= creada)
    ) {
      puntaje = 1;
    }
    if (
      puntaje > mejor.puntaje ||
      (puntaje > 0 && puntaje === mejor.puntaje && ultimo > mejor.ultimo)
    ) {
      mejor = { puntaje, ultimo, hilo };
    }
  }
  return mejor.puntaje > 0 ? [...mejor.hilo].sort(porFecha) : null;
}

export function decidirHilo(p: {
  /** Lo encontrado en cada buzón, en el orden en que se buscan. */
  encontrados: Array<{ buzon: string; mensajes: MensajeDelBuzon[] }>;
  esDeLaCasa: (correo: string) => boolean;
  esDeEventia: (correo: string) => boolean;
  /** Cuándo se anotó la última gestión en la bitácora (ISO). */
  ultimaGestion: string | null;
  /** Donde va el correo nuevo si no hay hilo (contacto@). */
  buzonParaNuevo: string;
  /** La cotización: su N° y cuándo se creó (ISO). */
  numero: number;
  creada: string | null;
}): DecisionDelHilo {
  // El primer buzón (en orden) que tenga el hilo de la cotización.
  let buzon = '';
  let hilo: MensajeDelBuzon[] | null = null;
  for (const e of p.encontrados) {
    hilo = hiloDeLaCotizacion({
      mensajes: e.mensajes,
      numero: p.numero,
      creada: p.creada,
      esDeEventia: p.esDeEventia,
    });
    if (hilo) {
      buzon = e.buzon;
      break;
    }
  }
  if (!hilo) return { modo: 'nuevo', buzon: p.buzonParaNuevo };

  if (hilo.some((m) => m.borrador)) {
    return {
      modo: 'saltar',
      motivo: `ya hay un borrador en el hilo de ${buzon}.`,
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
    return { modo: 'responder', buzon, mensaje: ultimo, hilo };
  }
  return { modo: 'seguimiento', buzon, mensaje: ultimo, hilo };
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
