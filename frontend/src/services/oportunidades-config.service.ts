import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// LA CONFIGURACIÓN DE OPORTUNIDADES (doc 17 §5.7): regiones, comunas
// cercanas y, desde la decisión 111, las categorías de ChileCompra del rubro.
// Salió de oportunidades.service.ts el 29-10, que estaba en el tope de 800
// líneas del portero; ese archivo la reexporta tal cual.

export interface ConfigOportunidades {
  regiones: string[];
  comunas_cercanas: string[];
  perfil: string;
  /** Las categorías de ChileCompra del rubro (decisión 111); vacía = la
   *  marca «del rubro» de siempre. */
  categorias: string[];
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
  categorias?: string[];
}) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/config`,
    "PATCH",
    config,
  )) as ConfigOportunidades;

/** Una categoría de ChileCompra con cuántas licitaciones tuvo en las
 *  regiones de la empresa en 3 años (decisión 111). */
export interface CategoriaParaElegir {
  categoria: string;
  licitaciones: number;
  sugerida: boolean;
}

/** Las categorías para elegir: las sugeridas primero, después las demás de
 *  más a menos licitaciones. */
export const getCategoriasOportunidades = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/config/categorias`,
    "GET",
  )) as CategoriaParaElegir[];
