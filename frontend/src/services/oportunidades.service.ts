import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// OPORTUNIDADES (doc 17): licitaciones y compras ágiles de Mercado Público
// que el radar trae y la IA lee. Solo administrador, solo empresas con el
// derecho `oportunidades`.

export type Semaforo = "verde" | "amarillo" | "rojo";

export type EstadoOportunidad =
  | "nueva"
  | "en_estudio"
  | "postulada"
  | "ganada"
  | "perdida"
  | "descartada";

export type TipoProceso = "licitacion" | "compra_agil";

export interface ProcesoDeLista {
  tipo: TipoProceso;
  nombre: string;
  organismo: string | null;
  organismo_codigo: string | null;
  unidad: string | null;
  comuna: string | null;
  region: string | null;
  monto: number | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  estado: string | null;
}

/** La misma compra del año anterior: quién ganó, por cuánto y cuántos
 *  ofertaron (sprint 1b). */
export interface Anterior {
  codigo: string;
  nombre: string;
  anio: number | null;
  oferentes: number | null;
  url_acta: string | null;
  ganadores: Array<{ nombre: string; monto: number | null }>;
}

export interface Oportunidad {
  id: number;
  codigo: string;
  semaforo: Semaforo | null;
  etiquetas: string[];
  se_hace_en_el_complejo: "si" | "no" | "dudoso" | null;
  razon: string | null;
  /** comuna_cercana | alto_valor */
  alertas: string[];
  estado: EstadoOportunidad;
  responsable_id: string | null;
  leida_en: string | null;
  proceso: ProcesoDeLista;
  anterior?: Anterior | null;
}

export interface CambioDeProceso {
  id: number;
  /** fecha_cierre | reapertura */
  tipo: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  creado_en: string;
}

export interface FichaDeOportunidad extends Omit<Oportunidad, "proceso"> {
  leida_con: string | null;
  notas: string | null;
  quotation_id: string | null;
  actualizado_en: string;
  proceso: ProcesoDeLista & {
    codigo: string;
    descripcion: string | null;
    moneda: string | null;
    fechas: Record<string, unknown>;
    productos: Array<{
      nombre?: string | null;
      descripcion?: string | null;
      cantidad?: number | null;
    }>;
    adjudicacion: Record<string, unknown> | null;
    primera_vez_visto: string;
    actualizado_en: string;
  };
  cambios: CambioDeProceso[];
  anterior: Anterior | null;
}

export interface ConfigOportunidades {
  regiones: string[];
  comunas_cercanas: string[];
  perfil: string;
  /** De Configuración de empresa: aquí solo se muestran. */
  umbral_alto_valor: number | null;
  correo_avisos: string | null;
}

export interface CorridaDelRadar {
  id: number;
  origen: string;
  estado: "corriendo" | "ok" | "error" | "abandonada";
  empezo_en: string;
  termino_en: string | null;
  resumen: {
    licitaciones?: { activas?: number; nuevas?: number; pendientes?: number };
    compras_agiles?: { nuevas?: number };
    lectura?: { leidas?: number };
    avisos?: string[];
  } | null;
  error: string | null;
}

export const getOportunidades = async (params: {
  vigentes?: boolean;
  estado?: EstadoOportunidad;
}) =>
  (await apiRequest(
    API_ROUTES.OPORTUNIDADES,
    "GET",
    undefined,
    params,
  )) as Oportunidad[];

export const getFichaDeOportunidad = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}`,
    "GET",
  )) as FichaDeOportunidad;

export const actualizarOportunidad = async (
  id: number,
  cambios: {
    estado?: EstadoOportunidad;
    responsable_id?: string | null;
    notas?: string | null;
  },
) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}`,
    "PATCH",
    cambios,
  )) as Pick<
    FichaDeOportunidad,
    "id" | "estado" | "responsable_id" | "notas" | "actualizado_en"
  >;

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

export const getCorridasDelRadar = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/radar/corridas`,
    "GET",
  )) as CorridaDelRadar[];

export const correrRadar = async () =>
  (await apiRequest(`${API_ROUTES.OPORTUNIDADES}/radar`, "POST")) as {
    iniciada: boolean;
    corrida?: number;
    motivo?: string;
  };
