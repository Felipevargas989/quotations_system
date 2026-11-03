// LO QUE PIENSA LA VENTANILLA DE BELIA, sin pantalla (doc 20 §8 y §8b).
// Separado para probarlo: en qué pantalla está la persona, qué ánimo
// muestra BelIA y cómo se lee lo que contesta.

import type { EstadoDeBelia } from "../../services/asistente.service";

/** Minutos sin que nadie use Eventia para que BelIA se duerma. */
export const MINUTOS_PARA_DORMIR = 5;

/** Con más compromisos vencidos que esto, se enoja (propuesta del 03-11). */
export const UMBRAL_DE_ENOJO = 10;

/** Como mucho un aviso («¡Guau! Tienes algo importante…») por hora. */
export const MINUTOS_ENTRE_AVISOS = 60;

export type Animo =
  | "espera"
  | "pensando"
  | "atencion"
  | "enojada"
  | "celebra"
  | "dormida";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Las pantallas que muestran UNA cotización (App.tsx). */
const CON_COTIZACION = new RegExp(
  `^/(?:negocio|quotation-form|post-venta)/(${UUID})(?:/|$)`,
  "i",
);

/** La pantalla que viaja con cada pregunta: la ruta, y la cotización
 *  abierta si hay una. El motor revisa que sea de la empresa. */
export const pantallaDe = (
  ruta: string,
): { ruta: string; cotizacion_id?: string } => {
  const m = CON_COTIZACION.exec(ruta);
  return m ? { ruta, cotizacion_id: m[1].toLowerCase() } : { ruta };
};

/** El ánimo que se ve, en orden de prioridad: lo que pasa ahora manda
 *  sobre el humor de fondo. Dormida le gana al enojo: si nadie la mira,
 *  descansa. */
export const animoDe = (a: {
  pensando: boolean;
  celebrando: boolean;
  avisando: boolean;
  dormida: boolean;
  vencidos: number;
}): Animo => {
  if (a.pensando) return "pensando";
  if (a.celebrando) return "celebra";
  if (a.avisando) return "atencion";
  if (a.dormida) return "dormida";
  if (a.vencidos > UMBRAL_DE_ENOJO) return "enojada";
  return "espera";
};

/** Si desde la última vez que miró llegó algo importante: un compromiso
 *  que vence hoy o un requerimiento nuevo. */
export const hayAlgoNuevo = (
  ahora: EstadoDeBelia | undefined,
  antes: EstadoDeBelia | undefined,
): boolean =>
  Boolean(
    ahora &&
      (ahora.vencen_hoy > (antes?.vencen_hoy ?? 0) ||
        ahora.requerimientos_de_hoy > (antes?.requerimientos_de_hoy ?? 0)),
  );

// ---------- Lo que contesta BelIA: un markdown chico ----------
//
// Claude contesta con párrafos, listas, tablas, **negritas** y enlaces a
// las fichas ([N° 500](/negocio/…)). Se arma con elementos de React, sin
// HTML crudo: un texto que venga de la base nunca se vuelve código.

export type Trozo =
  | { tipo: "texto"; texto: string }
  // Una negrita puede traer enlaces adentro: «**[N° 436](/post-venta/…) ·
  // Aerobica**» (primera prueba en el laboratorio, 03-11).
  | { tipo: "negrita"; trozos: Trozo[] }
  | { tipo: "enlace"; texto: string; ruta: string };

export type Bloque =
  | { tipo: "parrafo"; lineas: Trozo[][] }
  | { tipo: "lista"; ordenada: boolean; items: Trozo[][] }
  | { tipo: "tabla"; cabecera: Trozo[][]; filas: Trozo[][][] };

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const ENLACES = /(\[[^\]]+\]\([^)\s]+\))/g;

/** Los enlaces de un texto. Solo se enlazan rutas de Eventia (empiezan
 *  con «/»): un enlace de afuera queda como texto. */
const conEnlaces = (texto: string, partir: RegExp): Trozo[] =>
  texto
    .split(partir)
    .filter((x) => x !== "")
    .map((x): Trozo => {
      if (partir === INLINE && /^\*\*[^*]+\*\*$/.test(x)) {
        return { tipo: "negrita", trozos: conEnlaces(x.slice(2, -2), ENLACES) };
      }
      const enlace = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(x);
      if (enlace) {
        const [, t, ruta] = enlace;
        return ruta.startsWith("/") && !ruta.startsWith("//")
          ? { tipo: "enlace", texto: t, ruta }
          : { tipo: "texto", texto: t };
      }
      return { tipo: "texto", texto: x };
    });

/** Una línea en trozos: negritas (con sus enlaces) y enlaces. */
export const trozosDe = (linea: string): Trozo[] => conEnlaces(linea, INLINE);

const celdas = (fila: string): string[] =>
  fila
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const ES_SEPARADOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+/;

/** El texto de BelIA en bloques: tablas, listas y párrafos. */
export const bloquesDe = (texto: string): Bloque[] => {
  const bloques: Bloque[] = [];
  for (const crudo of texto.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lineas = crudo.split("\n").filter((l) => l.trim() !== "");
    if (lineas.length === 0) continue;
    if (
      lineas.length >= 2 &&
      lineas[0].trim().startsWith("|") &&
      ES_SEPARADOR.test(lineas[1].trim())
    ) {
      bloques.push({
        tipo: "tabla",
        cabecera: celdas(lineas[0]).map(trozosDe),
        filas: lineas.slice(2).map((l) => celdas(l).map(trozosDe)),
      });
      continue;
    }
    if (lineas.every((l) => ITEM.test(l))) {
      bloques.push({
        tipo: "lista",
        ordenada: Boolean(ITEM.exec(lineas[0])?.[1]),
        items: lineas.map((l) => trozosDe(l.replace(ITEM, ""))),
      });
      continue;
    }
    bloques.push({ tipo: "parrafo", lineas: lineas.map(trozosDe) });
  }
  return bloques;
};
