import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// BelIA, la asistente con IA (doc 20). El motor conversa con Claude y
// sus herramientas; acá solo viaja la conversación corta y la pantalla.

export type TurnoDeBelia = { rol: "persona" | "belia"; texto: string };

export type PantallaDeBelia = { ruta: string; cotizacion_id?: string };

/** Una propuesta de cambio (fase 2, doc 20 §3 y §8): la arma el motor y la
 *  persona la aplica con «Sí, aplicar». Las cifras ya vienen escritas. */
export type TarjetaDePropuesta = {
  id: string;
  tipo: "servicios" | "nota";
  numero: number;
  cliente: string | null;
  cotizacion_id: string;
  enlace: string;
  resumen: string;
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
};

/** Lo que mira la ventanilla para el ánimo de BelIA (doc 20 §8b). */
export type EstadoDeBelia = {
  vencidos: number;
  sin_gestion: number;
  vencen_hoy: number;
  requerimientos_de_hoy: number;
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

export const estadoDeBelia = async () =>
  (await apiRequest(API_ROUTES.ASISTENTE_ESTADO, "GET")) as EstadoDeBelia;

/** «Sí, aplicar», «No» o «Deshacer». El motor vuelve a revisar todo. */
export const responderPropuesta = async (
  id: string,
  accion: "aplicar" | "descartar" | "deshacer",
) =>
  (await apiRequest(
    `${API_ROUTES.ASISTENTE_PROPUESTAS}/${encodeURIComponent(id)}/${accion}`,
    "POST",
  )) as ResultadoDePropuesta;
