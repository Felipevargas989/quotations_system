import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// LA CONFIGURACIÓN DE OPORTUNIDADES (doc 17 §5.7): regiones y comunas
// cercanas. Salió de oportunidades.service.ts el 29-10 (decisión 111), que
// estaba en el tope de 800 líneas del portero; ese archivo la reexporta tal
// cual.

export interface ConfigOportunidades {
  regiones: string[];
  comunas_cercanas: string[];
  perfil: string;
  /** De Configuración de empresa: aquí solo se muestran. */
  umbral_alto_valor: number | null;
  correo_avisos: string | null;
}

export const getConfigOportunidades = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/config`,
    "GET",
  )) as ConfigOportunidades;

export const guardarConfigOportunidades = async (config: {
  regiones?: string[];
  comunas_cercanas?: string[];
  perfil?: string;
}) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/config`,
    "PATCH",
    config,
  )) as ConfigOportunidades;
