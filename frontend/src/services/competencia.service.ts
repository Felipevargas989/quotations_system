import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// COMPETIDORES REALES (doc 17, decisión 70, 22-10). Felipe: "podemos
// hacerle seguimiento a las empresas con las que he competido... también
// busca empresas similares... un botón de «no es mi competidor» (con un
// confirmar)". Sale de las actas públicas de adjudicación, que traen todas
// las ofertas. Aparte de oportunidades.service.ts, que llegó a las 800
// líneas del portero.

/** compitio: ofertó en una licitación donde ofertaste tú; similar: la IA
 *  lo ve parecido a ti y postula a tus compradores; seguido: lo sigues. */
export type EtiquetaDeCompetidor = "compitio" | "similar" | "seguido";

export interface CompetidorReal {
  rut: string;
  nombre: string;
  etiquetas: EtiquetaDeCompetidor[];
  /** Licitaciones donde ofertaron los dos. */
  encuentros: number;
  te_gano: number;
  ganaste: number;
  /** Su oferta frente a la tuya, en promedio y en %: −10 = 10 % más
   *  barato. null si no hay dos precios que comparar. */
  diferencia_de_precio: number | null;
  /** Sus ofertas y sus triunfos en los compradores donde postulas. */
  en_tus_compradores: number;
  triunfos_en_tus_compradores: number;
  monto_ganado: number;
  ultima: string | null;
  /** Por qué la IA lo ve parecido (o no). */
  similar_razon: string | null;
  seguido: boolean;
  descartado: boolean;
}

export interface EstadoDeLaCompetencia {
  competidores: CompetidorReal[];
  /** El RUT de «Mi empresa»: sin él no se sabe con quién compitió. */
  rut_empresa: string | null;
  busqueda: {
    buscando: boolean;
    leidas: number;
    total: number;
    clasificados: number;
  };
}

/** Una licitación donde ofertaron los dos. */
export interface Encuentro {
  codigo: string;
  proceso: string | null;
  organismo: string | null;
  fecha: string | null;
  su_oferta: number | null;
  tu_oferta: number | null;
  gano_el: boolean;
  ganaste: boolean;
}

export interface MarcaDeCompetidor {
  rut: string;
  nombre: string | null;
  seguido: boolean;
  descartado: boolean;
}

const RUTA = `${API_ROUTES.OPORTUNIDADES}/competencia`;

export const getCompetencia = async () =>
  (await apiRequest(RUTA, "GET")) as EstadoDeLaCompetencia;

/** «Buscar en las actas»: responde al tiro; la búsqueda sigue por detrás. */
export const buscarEnLasActas = async () =>
  (await apiRequest(`${RUTA}/buscar`, "POST")) as EstadoDeLaCompetencia;

export const getEncuentros = async (rut: string) =>
  (await apiRequest(
    `${RUTA}/${encodeURIComponent(rut)}/encuentros`,
    "GET",
  )) as { nombre: string | null; encuentros: Encuentro[] };

/** «Seguir» o «No es mi competidor» (o deshacerlo). */
export const marcarCompetidor = async (
  rut: string,
  cambios: { seguido?: boolean; descartado?: boolean },
) =>
  (await apiRequest(
    `${RUTA}/${encodeURIComponent(rut)}`,
    "PATCH",
    cambios,
  )) as MarcaDeCompetidor;
