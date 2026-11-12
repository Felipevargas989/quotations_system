import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// «BASES LEÍDAS SOLAS» (decisiones 131 y 132): las bases que leyó solo el
// motor (la lectura corta de cada pasada) y lo que costaron, hoy y en los últimos 7
// días. Aparte de
// oportunidades.service.ts, que está en el tope de 800 líneas del portero.

export interface GastoDeLaLecturaSola {
  hoy: { bases: number; usd: number };
  semana: { bases: number; usd: number };
}

export const getLecturaSola = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/lectura-sola`,
    "GET",
  )) as GastoDeLaLecturaSola;
