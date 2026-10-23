import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type { Competidor } from "./oportunidades.service";

// COMPETIDORES REALES (doc 17, decisiones 70 y 71, 22 y 23-10). Felipe: "mis
// competidores son esos": los que ofertaron donde ofertó la empresa, ganara
// o perdiera; "y luego traer la información de ellos, todas las
// licitaciones en las que participan... es como un estudio de mercado". Sale
// de las actas públicas de adjudicación, que se leen solas (sin botón).
// Aparte de oportunidades.service.ts, que llegó a las 800 líneas del portero.

/** compitio: ofertó donde ofertaste tú; seguido: lo sigues. */
export type EtiquetaDeCompetidor = "compitio" | "seguido";

export interface CompetidorReal {
  rut: string;
  nombre: string;
  etiquetas: EtiquetaDeCompetidor[];
  /** Licitaciones donde ofertaron los dos. */
  encuentros: number;
  te_gano: number;
  ganaste: number;
  /** Su precio frente al tuyo, en % y en promedio, solo en las líneas que
   *  ofertaron los dos: −10 = 10 % más barato. null si no hay ninguna. */
  diferencia_de_precio: number | null;
  lineas_comparadas: number;
  /** Lo suyo en las actas leídas de tu zona. */
  participaciones: number;
  ganadas: number;
  monto_ganado: number;
  ultima: string | null;
  comprador_principal: { nombre: string; veces: number } | null;
  seguido: boolean;
  descartado: boolean;
}

/** Las actas de la zona (3 años): cuántas hay y cuántas van leídas. */
export interface EstadoDeLasActas {
  leidas: number;
  total: number;
  leyendo: boolean;
}

export interface EstadoDeLaCompetencia {
  competidores: CompetidorReal[];
  /** El RUT de «Mi empresa»: sin él no se sabe con quién compitió. */
  rut_empresa: string | null;
  actas: EstadoDeLasActas;
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
  diferencia_de_precio: number | null;
  lineas_comparadas: number;
}

/** Una licitación del estudio de mercado de un competidor. */
export interface ParticipacionDeMercado {
  codigo: string;
  proceso: string | null;
  organismo: string | null;
  comuna: string | null;
  fecha: string | null;
  su_oferta: number | null;
  lineas: number | null;
  detalle: string | null;
  gano: boolean;
  ganadores: Array<{ rut: string; nombre: string; monto: number }>;
  ofertas: number | null;
  contigo: boolean;
}

export interface FichaDeMercado {
  rut: string;
  nombre: string;
  seguido: boolean;
  descartado: boolean;
  resumen: {
    participaciones: number;
    ganadas: number;
    perdidas: number;
    monto_ganado: number;
    ultima: string | null;
    compradores: Array<{ nombre: string; veces: number; ganadas: number }>;
  };
  encuentros: Encuentro[];
  licitaciones: ParticipacionDeMercado[];
}

/** «Quién gana en tu zona», solo lo de tu rubro, y cuánto va revisado. */
export interface QuienGanaEnTuZona {
  ranking: Competidor[];
  rubro: { revisadas: number; total: number; revisando: boolean };
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

export const getQuienGana = async () =>
  (await apiRequest(`${RUTA}/zona`, "GET")) as QuienGanaEnTuZona;

export const getFichaDeMercado = async (rut: string) =>
  (await apiRequest(
    `${RUTA}/${encodeURIComponent(rut)}`,
    "GET",
  )) as FichaDeMercado;

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
