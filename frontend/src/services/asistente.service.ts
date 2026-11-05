import { API_ROUTES } from "../constants/api.routes";
import { leerEventos } from "../utils/eventosEnVivo";
import { api, apiRequest } from "./api";

// BelIA, la asistente con IA (doc 20). El motor conversa con Claude y
// sus herramientas; acá solo viaja la conversación corta y la pantalla.

export type TurnoDeBelia = { rol: "persona" | "belia"; texto: string };

export type PantallaDeBelia = {
  ruta: string;
  cotizacion_id?: string;
  cliente_id?: string;
};

/** Una propuesta de cambio (fase 2, doc 20 §3 y §8): la arma el motor y la
 *  persona la aplica con «Sí, aplicar». Las cifras ya vienen escritas. */
export type TarjetaDePropuesta = {
  id: string;
  tipo:
    | "servicios"
    | "nota"
    | "cotizacion_nueva"
    | "seguimiento"
    | "leccion"
    | "leccion_estado"
    // Corregir un cliente mal clasificado (doc 21 §6).
    | "cliente";
  /** Null en un evento nuevo hasta que se crea. */
  numero: number | null;
  cliente: string | null;
  cotizacion_id: string | null;
  enlace: string | null;
  resumen: string;
  /** «Crear evento»: lo que se va a crear. */
  nueva?: {
    es: "cotización" | "requerimiento";
    cliente: string;
    cliente_nuevo: boolean;
    tipo_de_evento: string;
    fechas: string;
    personas: string;
    contacto?: string;
  };
  lineas: Array<{
    dia: string;
    que: string;
    quita: string[];
    agrega: string[];
    personas?: string;
    casilla?: "nueva" | "sale";
  }>;
  total?: { antes: string; despues: string; diferencia: string };
  cuotas?: Array<{
    cuota: number;
    vence: string | null;
    antes: string;
    despues: string;
  }>;
  cuota_nueva?: string;
  reembolso_nuevo?: string;
  reembolso_compensado?: string;
  avisos: string[];
  nota?: { texto: string; canal: string; proximo_contacto: string | null };
  /** Una lección (doc 20 §17): el texto, para qué vale y qué se decide. */
  leccion?: {
    texto: string;
    para: string;
    motivo: string | null;
    decision?: "aprobar" | "descartar" | "olvidar";
    propuesta_por?: string | null;
  };
  se_puede_deshacer: boolean;
  vence_at: string;
};

export type RespuestaDeBelia = {
  respuesta: string;
  herramientas: string[];
  segundos: number;
  costo_usd: number;
  /** Solo llega a los administradores (doc 20 §7). */
  uso_del_mes?: { gastado_usd: number; tope_usd: number };
  /** Las propuestas de esta respuesta (fase 2). */
  propuestas?: TarjetaDePropuesta[];
};

export type ResultadoDePropuesta = {
  estado: "aplicada" | "deshecha" | "descartada";
  numero?: number;
  enlace?: string;
  total?: string;
  se_puede_deshacer?: boolean;
  /** Lo que pasó, en una línea (el borrador del seguimiento, doc 20 §17). */
  aviso?: string;
};

/** Lo que mira la ventanilla para el ánimo de BelIA (doc 20 §8b). */
export type EstadoDeBelia = {
  vencidos: number;
  sin_gestion: number;
  vencen_hoy: number;
  requerimientos_de_hoy: number;
  /** Cotizaciones con tope de calendario (03-11, la lista del tablero). */
  topes_de_calendario?: number;
  /** Comprobantes del portal sin revisar (operaciones para arriba). */
  comprobantes_por_revisar?: number;
};

export const preguntarABelia = async (
  mensaje: string,
  historial: TurnoDeBelia[],
  pantalla: PantallaDeBelia,
) =>
  (await apiRequest(API_ROUTES.ASISTENTE_MENSAJES, "POST", {
    mensaje,
    historial,
    pantalla,
  })) as RespuestaDeBelia;

/** Lo que va llegando mientras BelIA trabaja: el texto, y el aviso de que
 *  va a buscar algo (lo escrito antes de eso no es la respuesta). */
export type EventoDeBelia =
  | { tipo: "texto"; texto: string }
  | { tipo: "herramientas"; nombres: string[] };

/** La respuesta en vivo (doc 20 §9): el texto va llegando mientras BelIA
 *  lo escribe. Va por la misma instancia de la casa (`api`, con la sesión y
 *  su renovación); el navegador entrega lo recibido en cada avance de la
 *  descarga. Termina con la respuesta completa, igual que la otra puerta. */
export const preguntarABeliaEnVivo = async (
  mensaje: string,
  historial: TurnoDeBelia[],
  pantalla: PantallaDeBelia,
  alEscribir: (e: EventoDeBelia) => void,
): Promise<RespuestaDeBelia> => {
  let leido = 0;
  let final: RespuestaDeBelia | null = null;
  let falla: { status?: number; message?: string } | null = null;
  const alLeer = (evento: string, datos: unknown) => {
    if (evento === "fin") final = datos as RespuestaDeBelia;
    else if (evento === "error") falla = datos as typeof falla;
    else alEscribir(datos as EventoDeBelia);
  };
  try {
    const r = await api.post(
      API_ROUTES.ASISTENTE_EN_VIVO,
      { mensaje, historial, pantalla },
      {
        responseType: "text",
        onDownloadProgress: (p) => {
          const xhr = p.event?.target as XMLHttpRequest | undefined;
          if (xhr?.responseText)
            leido = leerEventos(xhr.responseText, leido, alLeer);
        },
      },
    );
    leido = leerEventos(String(r.data ?? ""), leido, alLeer);
  } catch (e) {
    // Lo que el motor rechaza antes de empezar (el tope, el cargo) llega
    // como texto: se lee como JSON para que humanizeApiError lo entienda.
    const resp = (e as { response?: { data?: unknown } }).response;
    if (resp && typeof resp.data === "string") {
      try {
        resp.data = JSON.parse(resp.data);
      } catch {
        // Se queda como texto.
      }
    }
    throw e;
  }
  if (falla) {
    const { status, message } = falla as { status?: number; message?: string };
    throw { response: { status, data: { message } } };
  }
  if (!final) throw new Error("La respuesta de BelIA se cortó en el camino.");
  return final;
};

export const estadoDeBelia = async () =>
  (await apiRequest(API_ROUTES.ASISTENTE_ESTADO, "GET")) as EstadoDeBelia;

/** Un turno como lo guarda el motor (doc 20 §13): el de la pantalla, sin
 *  lo que BelIA está escribiendo en vivo. Las tarjetas van tal cual. */
export type TurnoGuardado = TurnoDeBelia & {
  error?: boolean;
  propuestas?: Record<string, unknown>[];
};

/** La conversación de quien escribe, la de la sesión: sigue al cerrar la
 *  ventana y desde otro equipo. */
export const leerConversacion = async () =>
  (
    (await apiRequest(API_ROUTES.ASISTENTE_CONVERSACION, "GET")) as {
      turnos: TurnoGuardado[];
    }
  ).turnos ?? [];

/** `reiniciada`: a la persona le cambiaron el cargo y la conversación
 *  parte de cero (no arrastra lo que vio con el anterior). */
export const guardarConversacion = async (
  cargo: string,
  turnos: TurnoGuardado[],
) =>
  (await apiRequest(API_ROUTES.ASISTENTE_CONVERSACION, "PUT", {
    cargo,
    turnos,
  })) as { reiniciada: boolean };

/** «Nueva conversación». */
export const borrarConversacion = async () => {
  await apiRequest(API_ROUTES.ASISTENTE_CONVERSACION, "DELETE");
};

/** «Sí, aplicar», «No» o «Deshacer». El motor vuelve a revisar todo. */
export const responderPropuesta = async (
  id: string,
  accion: "aplicar" | "descartar" | "deshacer",
) =>
  (await apiRequest(
    `${API_ROUTES.ASISTENTE_PROPUESTAS}/${encodeURIComponent(id)}/${accion}`,
    "POST",
  )) as ResultadoDePropuesta;
