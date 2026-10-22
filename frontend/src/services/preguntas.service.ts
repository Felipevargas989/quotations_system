import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// PREGÚNTALE A LA IA SOBRE ESTAS BASES (doc 17, decisión 67, 22-10): el
// hilo de preguntas y respuestas de una oportunidad, y una pregunta nueva.
// Aparte de oportunidades.service.ts, que llegó a las 800 líneas del portero.

export interface CitaDeLaIA {
  documento: string;
  /** 0 = no se sabe (o es un Word). */
  pagina: number;
  texto: string;
}

export interface PreguntaALaIA {
  id: number;
  oportunidad_id: number;
  pregunta: string;
  estado: "procesando" | "listo" | "error";
  respuesta: string | null;
  citas: CitaDeLaIA[];
  /** alta: lo dicen los documentos; media: una deducción; baja: no está. */
  seguridad: "alta" | "media" | "baja" | null;
  error: string | null;
  modelo: string | null;
  tokens_cache_leida: number | null;
  costo_usd: number | null;
  quien: { full_name: string | null } | null;
  /** Lo que confirmó el comprador (decisión 68): con eso entra a la
   *  memoria de la licitación. */
  confirmado?: string | null;
  confirmado_en?: string | null;
  creado_en: string;
  terminado_en: string | null;
}

export const getPreguntas = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/preguntas`,
    "GET",
  )) as PreguntaALaIA[];

export const preguntar = async (id: number, pregunta: string) =>
  (await apiRequest(`${API_ROUTES.OPORTUNIDADES}/${id}/preguntas`, "POST", {
    pregunta,
  })) as PreguntaALaIA;

/** Lo que confirmó el comprador sobre una respuesta (decisión 68). Vacío
 *  lo borra. */
export const confirmarPregunta = async (
  id: number,
  preguntaId: number,
  confirmado: string,
) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/preguntas/${preguntaId}`,
    "PATCH",
    { confirmado },
  )) as PreguntaALaIA;
