import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

/** El embudo de consultas (05-09, doc 12): las consultas masivas que
 *  reciben el brochure por correo y solo se vuelven cotización cuando
 *  el interesado contesta. */

export interface Consulta {
  id: number;
  name: string;
  email: string;
  phone: string;
  client_type: string | null;
  event_type: string;
  event_date: string | null;
  people_count: number | null;
  children_count: number | null;
  observations: string | null;
  estado: "respondida" | "convertida" | "descartada";
  correo_enviado: boolean;
  client_id: string | null;
  created_at: string;
}

export interface Brochure {
  nombre: string;
  path: string;
  bytes: number;
}

export interface ConfigDeConsulta {
  event_type: string;
  texto: string | null;
  brochures: Brochure[];
}

export const getConsultas = async () =>
  (await apiRequest(API_ROUTES.CONSULTAS, "GET")) as Consulta[];

export const getConfigsDeConsulta = async () =>
  (await apiRequest(
    `${API_ROUTES.CONSULTAS}/config`,
    "GET",
  )) as ConfigDeConsulta[];

export const guardarConfigDeConsulta = async (
  eventType: string,
  cambios: { texto?: string | null; brochures?: Brochure[] },
) =>
  (await apiRequest(
    `${API_ROUTES.CONSULTAS}/config/${encodeURIComponent(eventType)}`,
    "PUT",
    cambios,
  )) as ConfigDeConsulta;

export const convertirConsulta = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.CONSULTAS}/${String(id)}/convertir`,
    "POST",
    {},
  )) as { consulta: Consulta; client_id: string };

export const descartarConsulta = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.CONSULTAS}/${String(id)}/descartar`,
    "POST",
    {},
  )) as Consulta;
