import { API_ROUTES } from "../constants/api.routes";
import type { MarcaDeExigencia } from "./exigencias.service";
import { apiRequest } from "./api";

// «LO QUE EVENTIA SABE DE TU EMPRESA» (decisión 119, parte 3; migración
// 190): lo que la empresa respondió para postular, en «Mi empresa», para
// verlo, cambiarlo o borrarlo.

export interface RespuestaDeLaEmpresa {
  id: number;
  clave: string;
  pregunta: string;
  exigencia: string | null;
  respuesta: MarcaDeExigencia;
  detalle: string | null;
  /** La licitación de donde salió (null si se borró). */
  oportunidad_id: number | null;
  oportunidad?: { codigo: string } | null;
  creado_en: string;
  actualizado_en: string;
}

const RUTA = `${API_ROUTES.OPORTUNIDADES}/oferente/lo-que-sabemos`;

export const getLoQueSabemos = async () =>
  ((await apiRequest(RUTA, "GET")) as RespuestaDeLaEmpresa[] | null) ?? [];

export const cambiarLoQueSabemos = async (
  id: number,
  cambios: { respuesta?: MarcaDeExigencia; detalle?: string },
) =>
  (await apiRequest(`${RUTA}/${id}`, "PATCH", cambios)) as RespuestaDeLaEmpresa;

export const borrarLoQueSabemos = async (id: number) => {
  await apiRequest(`${RUTA}/${id}`, "DELETE");
};
