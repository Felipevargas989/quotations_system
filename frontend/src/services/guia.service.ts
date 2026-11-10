import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// La guía de la casa que lee BelIA (doc 20 §18). La edita solo
// administración en Mi empresa → «Guía de la casa».

export type SeccionDeGuia = { titulo: string; texto: string };

export type Guia = {
  secciones: SeccionDeGuia[];
  actualizada_por_nombre: string | null;
  updated_at: string | null;
};

/** Los mismos topes del motor (`TOPES_DE_LA_GUIA`). */
export const TOPES_DE_LA_GUIA = {
  secciones: 40,
  titulo: 80,
  texto: 4000,
  total: 30_000,
} as const;

export const leerGuia = async () =>
  (await apiRequest(API_ROUTES.GUIA_DE_LA_CASA, "GET")) as Guia;

export const guardarGuia = async (secciones: SeccionDeGuia[]) =>
  (await apiRequest(API_ROUTES.GUIA_DE_LA_CASA, "PUT", {
    secciones,
  })) as Guia;
