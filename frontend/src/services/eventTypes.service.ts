import { API_ROUTES } from "../constants/api.routes";
import { EventType } from "../types/quotations.types";
import { apiRequest } from "./api";

// TIPOS DE EVENTO por empresa (tabla event_types, 05-09 — doc 12).
// Dejaron de ser lista fija en el código: se administran en la página
// Consultas, y cada tipo declara su ENTRADA — cotización (directa,
// como siempre) o consulta (el embudo con brochure). OJO: tipo de
// CLIENTE y tipo de EVENTO son ejes distintos.

export interface TipoDeEvento {
  id: number;
  name: string;
  entrada: "cotizacion" | "consulta";
  /** Un tipo en uso no se elimina: se inactiva y deja de ofrecerse. */
  activo: boolean;
  sort_order: number | null;
}

export const getEventTypes = async (): Promise<TipoDeEvento[]> =>
  (await apiRequest(API_ROUTES.EVENT_TYPES, "GET")) as TipoDeEvento[];

// Consulta compartida de React Query: todas las pantallas que listan
// tipos usan esta definición (misma queryKey = mismo caché). Respaldo:
// los 8 históricos del enum si el catálogo no responde.
export const eventTypesQueryOptions = {
  queryKey: ["eventTypes"] as const,
  queryFn: async (): Promise<TipoDeEvento[]> => {
    try {
      return await getEventTypes();
    } catch {
      return Object.values(EventType).map((name, i) => ({
        id: -(i + 1),
        name,
        entrada: "cotizacion" as const,
        activo: true,
        sort_order: i,
      }));
    }
  },
};

// Para el formulario público (sin login), como los tipos de cliente.
export const getEventTypesPublic = async (
  companyId: string | number,
): Promise<{ name: string }[]> =>
  (await apiRequest(
    `${API_ROUTES.EVENT_TYPES}/public/${String(companyId)}`,
    "GET",
  )) as { name: string }[];

export const createEventType = async (name: string) =>
  (await apiRequest(API_ROUTES.EVENT_TYPES, "POST", {
    name,
  })) as TipoDeEvento;

export const actualizarEventType = async (
  id: number,
  cambios: { entrada?: "cotizacion" | "consulta"; activo?: boolean },
) =>
  (await apiRequest(
    `${API_ROUTES.EVENT_TYPES}/${String(id)}`,
    "PATCH",
    cambios,
  )) as TipoDeEvento;

export const deleteEventType = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.EVENT_TYPES}/${String(id)}`,
    "DELETE",
  )) as { id: number };
