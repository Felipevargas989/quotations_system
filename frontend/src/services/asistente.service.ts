import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// BelIA, la asistente con IA (doc 20). El motor conversa con Claude y
// sus herramientas; acá solo viaja la conversación corta y la pantalla.

export type TurnoDeBelia = { rol: "persona" | "belia"; texto: string };

export type PantallaDeBelia = { ruta: string; cotizacion_id?: string };

export type RespuestaDeBelia = {
  respuesta: string;
  herramientas: string[];
  segundos: number;
  costo_usd: number;
  /** Solo llega a los administradores (doc 20 §7). */
  uso_del_mes?: { gastado_usd: number; tope_usd: number };
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
