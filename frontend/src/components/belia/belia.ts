// LO QUE PIENSA LA VENTANILLA DE BELIA, sin pantalla (doc 20 §8 y §8b).
// Separado para probarlo: en qué pantalla está la persona, qué ánimo
// muestra BelIA y cómo se lee lo que contesta.

import type {
  EstadoDeBelia,
  PantallaDeBelia,
} from "../../services/asistente.service";

/** Minutos sin que nadie use Eventia para que BelIA se duerma. */
export const MINUTOS_PARA_DORMIR = 5;

/** Con más compromisos vencidos que esto, se enoja (propuesta del 03-11). */
export const UMBRAL_DE_ENOJO = 10;

/** Como mucho un aviso («¡Guau! Tienes algo importante…») por hora. */
export const MINUTOS_ENTRE_AVISOS = 60;

/** Segundos pensando antes de mostrarla «trabajando» (con su notebook):
 *  si tarda, es que está consultando Eventia. */
export const SEGUNDOS_PARA_TRABAJAR = 2.5;

export type Animo =
  | "espera"
  | "pensando"
  | "trabajando"
  | "atencion"
  | "enojada"
  | "celebra"
  | "dormida";

export const ANIMOS: readonly Animo[] = [
  "espera",
  "pensando",
  "trabajando",
  "atencion",
  "enojada",
  "celebra",
  "dormida",
];

/** Solo en el laboratorio, `?belia=dormida` muestra ese ánimo, para mirar
 *  cada uno sin esperar a que pase (Felipe, 03-11: "para ver como
 *  quedaría"). En producción no hace nada. */
export const animoForzado = (
  busqueda: string,
  esLaboratorio: boolean,
): Animo | null => {
  if (!esLaboratorio) return null;
  const pedido = new URLSearchParams(busqueda).get("belia");
  return ANIMOS.includes(pedido as Animo) ? (pedido as Animo) : null;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Las pantallas que muestran UNA cotización (App.tsx). */
const CON_COTIZACION = new RegExp(
  `^/(?:negocio|quotation-form|post-venta)/(${UUID})(?:/|$)`,
  "i",
);

/** La ficha de UN cliente (doc 20 §17, mejora 2). */
const CON_CLIENTE = new RegExp(`^/clients/(${UUID})(?:/|$)`, "i");

/** La pantalla que viaja con cada pregunta: la ruta, y la cotización o el
 *  cliente abierto si hay uno. El motor revisa que sea de la empresa. */
export const pantallaDe = (ruta: string): PantallaDeBelia => {
  const m = CON_COTIZACION.exec(ruta);
  if (m) return { ruta, cotizacion_id: m[1].toLowerCase() };
  const c = CON_CLIENTE.exec(ruta);
  return c ? { ruta, cliente_id: c[1].toLowerCase() } : { ruta };
};

/** El ánimo que se ve, en orden de prioridad: lo que pasa ahora manda
 *  sobre el humor de fondo. Dormida le gana al enojo: si nadie la mira,
 *  descansa. */
export const animoDe = (a: {
  /** Mientras espera la respuesta: primero piensa, después trabaja. */
  esperando: "pensando" | "trabajando" | null;
  celebrando: boolean;
  avisando: boolean;
  dormida: boolean;
  vencidos: number;
}): Animo => {
  if (a.esperando) return a.esperando;
  if (a.celebrando) return "celebra";
  if (a.avisando) return "atencion";
  if (a.dormida) return "dormida";
  if (a.vencidos > UMBRAL_DE_ENOJO) return "enojada";
  return "espera";
};

/** Lo que hace que BelIA llame la atención cuando sube (doc 20 §8b). */
const LO_IMPORTANTE = [
  "vencen_hoy",
  "requerimientos_de_hoy",
  "topes_de_calendario",
  "comprobantes_por_revisar",
] as const;

/** Si desde la última vez que miró llegó algo importante: un compromiso
 *  que vence hoy, un requerimiento nuevo, un tope de calendario o un
 *  comprobante del portal por revisar. */
export const hayAlgoNuevo = (
  ahora: EstadoDeBelia | undefined,
  antes: EstadoDeBelia | undefined,
): boolean =>
  Boolean(
    ahora && LO_IMPORTANTE.some((k) => (ahora[k] ?? 0) > (antes?.[k] ?? 0)),
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
/** Una tabla pegada al párrafo de arriba o de abajo, sin línea en blanco,
 *  se separa: Claude a veces la escribe así (la primera pregunta en
 *  producción, 04-11: «…según con cuál chocan:» y la tabla debajo salió
 *  como texto con rayas). */
const separarTablas = (texto: string): string => {
  const lineas = texto.split("\n");
  const salida: string[] = [];
  lineas.forEach((l, i) => {
    const anterior = salida[salida.length - 1];
    const esFila = l.trim().startsWith("|");
    const empiezaTabla =
      esFila && ES_SEPARADOR.test((lineas[i + 1] ?? "").trim());
    const veniaTabla =
      anterior !== undefined && anterior.trim().startsWith("|");
    if (empiezaTabla && anterior !== undefined && anterior.trim() !== "") {
      salida.push("");
    } else if (!esFila && veniaTabla && l.trim() !== "") {
      salida.push("");
    }
    salida.push(l);
  });
  return salida.join("\n");
};

export const bloquesDe = (texto: string): Bloque[] => {
  const bloques: Bloque[] = [];
  for (const crudo of separarTablas(texto.replace(/\r/g, "")).split(
    /\n\s*\n/,
  )) {
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

// ---------- Fase 2: lo que pasó con cada propuesta ----------

/** Lo que pasó con una propuesta en la ventanilla. */
export type EstadoDeTarjeta =
  | "pendiente"
  | "enviando"
  | "aplicada"
  | "descartada"
  | "deshecha"
  | "fallo";

const LO_QUE_PASO: Record<EstadoDeTarjeta, string> = {
  pendiente: "la persona todavía no la aplica",
  enviando: "se está aplicando",
  aplicada: "la persona la aplicó y quedó guardada",
  descartada: "la persona dijo que no",
  deshecha: "la persona la aplicó y después la deshizo",
  fallo: "no se pudo aplicar",
};

/** Lo que BelIA lee de su turno en la conversación: su texto y, si propuso
 *  algo, qué hizo la persona con eso. Sin esto, en la pregunta siguiente
 *  no sabría si su propuesta se aplicó. */
export const textoParaBelia = (t: {
  texto: string;
  propuestas?: { numero: number | null; estado: EstadoDeTarjeta }[];
}): string =>
  t.propuestas?.length
    ? `${t.texto}\n\n${t.propuestas
        .map(
          (p) =>
            `(Propuesta ${p.numero != null ? `de la N° ${p.numero}` : "de un evento nuevo"}: ${LO_QUE_PASO[p.estado]}.)`,
        )
        .join("\n")}`
    : t.texto;

/** Los turnos y lo que pesan, como mucho, al guardarse en Eventia (el motor
 *  recibe hasta 100 KB). */
export const MAX_TURNOS_GUARDADOS = 30;
export const MAX_CARACTERES_GUARDADOS = 80_000;

/** La conversación como se guarda en Eventia (doc 20 §13, migración 182):
 *  sin lo que BelIA está escribiendo en vivo, los 30 turnos más nuevos y,
 *  si pesan demasiado, menos. Una tarjeta que se estaba aplicando se guarda
 *  pendiente: al volver a apretarla, el motor dice cómo quedó. */
export const paraGuardar = (
  turnos: {
    rol: "persona" | "belia";
    texto: string;
    error?: boolean;
    escribiendo?: boolean;
    propuestas?: { estado: EstadoDeTarjeta }[];
  }[],
) => {
  let guardados = turnos
    .filter((t) => !t.escribiendo)
    .slice(-MAX_TURNOS_GUARDADOS)
    .map((t) => ({
      rol: t.rol,
      texto: t.texto,
      ...(t.error ? { error: true } : {}),
      ...(t.propuestas?.length
        ? {
            propuestas: t.propuestas.map((p) =>
              p.estado === "enviando" ? { ...p, estado: "pendiente" } : p,
            ) as unknown as Record<string, unknown>[],
          }
        : {}),
    }));
  while (
    guardados.length > 1 &&
    JSON.stringify(guardados).length > MAX_CARACTERES_GUARDADOS
  ) {
    guardados = guardados.slice(1);
  }
  return guardados;
};
