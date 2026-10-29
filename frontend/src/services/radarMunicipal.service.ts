import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// EL RADAR MUNICIPAL (decisión 108, solo en el laboratorio): lo que compran
// los municipios con los datos abiertos de ChileCompra, quién gana, en qué
// meses, dónde no está la empresa y las señales de riesgo del informe de
// anomalías. Todo sale de `radar_tablero` (migración 171).

/** Lo que se repite en el detalle de una señal de proveedores. */
export interface ProveedorDeUnaSenal {
  rut: string;
  proveedor: string | null;
  ordenes: number;
  monto: number;
  dia?: string;
  utm?: number;
}

/** Las señales de un municipio en los últimos 12 meses: cada una con su
 *  valor, sus ejemplos y si quedó marcada (`s_*`). */
export interface SenalesDelMunicipio {
  desde: string;
  hasta: string;
  senales: number;
  ordenes: number;
  gasto_total: number;
  licitaciones: number | null;
  unica: number;
  cuota_unica: number | null;
  cerca_unica: number | null;
  s_unica: boolean;
  plazo_corto: number;
  plazo_corto_ejemplos: string[] | null;
  s_plazo_corto: boolean;
  demoras: number;
  cuota_demoras: number | null;
  demoras_ejemplos: string[] | null;
  s_demora: boolean;
  proveedor_mayor: string | null;
  cuota_proveedor_mayor: number | null;
  s_proveedor_mayor: boolean;
  sobre_presupuesto: number;
  cuota_sobre_presupuesto: number | null;
  sobre_presupuesto_ejemplos: string[] | null;
  s_sobre_presupuesto: boolean;
  comparables: number | null;
  no_la_mas_barata: number;
  no_la_mas_barata_ejemplos: string[] | null;
  s_no_la_mas_barata: boolean;
  cuota_trato_directo: number | null;
  promedio_trato_directo: number | null;
  s_trato_directo: boolean;
  emergencias_recurrentes: number;
  emergencias_recurrentes_detalle: ProveedorDeUnaSenal[] | null;
  s_emergencias_recurrentes: boolean;
  compras_partidas: number;
  compras_partidas_detalle: ProveedorDeUnaSenal[] | null;
  s_compras_partidas: boolean;
  compras_agiles: number | null;
  bajo_el_tope: number;
  s_bajo_el_tope: boolean;
  tipo_no_calza: number;
  tipo_no_calza_ejemplos: string[] | null;
  s_tipo_no_calza: boolean;
  rubro_por_habitante: number | null;
  promedio_por_habitante: number | null;
  s_por_habitante: boolean;
  con_elegida: number | null;
  una_sola_cotizacion: number;
  cuota_una_sola: number | null;
  s_una_sola_cotizacion: boolean;
}

export interface MunicipioDelRadar {
  organismo_codigo: string;
  nombre: string;
  comuna: string | null;
  region: string | null;
  poblacion: number | null;
  total: number | null;
  ordenes: number | null;
  rubro: number | null;
  ordenes_rubro: number | null;
  trato_directo: number | null;
  emergencia: number | null;
  ordenes_emergencia: number | null;
  rubro_por_habitante: number | null;
  cuota_trato_directo: number | null;
  presente: boolean;
  proveedor_mayor_nombre: string | null;
  senales: SenalesDelMunicipio | null;
}

export interface TableroDelRadar {
  /** El año mirado: el pedido o, sin pedir, el último completo. */
  anio: number;
  /** Los años con al menos 6 meses de datos. */
  anios: number[];
  /** Los meses con datos del año mirado (1 a 12). */
  meses_del_anio: number[];
  ventana: { desde: string | null; hasta: string | null };
  nacional: {
    municipios_con_rubro: number;
    rubro_promedio: number | null;
    rubro_por_habitante: number | null;
    cuota_trato_directo: number | null;
  } | null;
  municipios: MunicipioDelRadar[];
  quien_gana: Array<{
    rut: string;
    nombre: string | null;
    actividad: string | null;
    monto: number;
    ordenes: number;
    municipios: number;
  }>;
  cuando_compran: Array<{ mes: number; ordenes: number; monto: number }>;
  donde_no_estas: Array<{
    organismo_codigo: string;
    nombre: string;
    comuna: string | null;
    rubro: number;
    ordenes_rubro: number;
    quien_le_vende: string | null;
  }>;
  /** Las regiones que se miraron (vacío = todo Chile) y las de la empresa. */
  regiones: string[];
  zona: string[];
}

export const getRadarMunicipal = async (pedido: {
  anio?: number;
  region?: string;
}) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/radar-municipal`,
    "GET",
    undefined,
    pedido,
  )) as TableroDelRadar;
