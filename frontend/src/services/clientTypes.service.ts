import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// Tipos de cliente por empresa (tabla client_types). Los tipos dejaron
// de ser una lista fija en el código: se crean desde la interfaz
// (ej: "Club Adulto Mayor"). Definido con Felipe el 21-07-2026.

export interface ClientTypeItem {
  id: number;
  name: string;
  sort_order?: number | null;
}

export const getClientTypes = async (): Promise<ClientTypeItem[]> => {
  const response = await apiRequest(API_ROUTES.CLIENT_TYPES, "GET");
  return response as ClientTypeItem[];
};

// Para formularios públicos (sin login): cotización pública.
export const getClientTypesPublic = async (
  companyId: string | number,
): Promise<ClientTypeItem[]> => {
  const response = await apiRequest(
    `${API_ROUTES.CLIENT_TYPES_PUBLIC}/${companyId}`,
    "GET",
  );
  return response as ClientTypeItem[];
};

export const createClientType = async (
  name: string,
): Promise<ClientTypeItem> => {
  const response = await apiRequest(API_ROUTES.CLIENT_TYPES, "POST", { name });
  return response as ClientTypeItem;
};

export const deleteClientType = async (id: number) => {
  const response = await apiRequest(`${API_ROUTES.CLIENT_TYPES}/${id}`, "DELETE");
  return { data: response };
};

// Reordenar (flechas ↑↓ del panel Gestionar tipos): ids en el orden final.
export const reorderClientTypes = async (
  ids: number[],
): Promise<ClientTypeItem[]> => {
  const response = await apiRequest(
    `${API_ROUTES.CLIENT_TYPES}/reorder`,
    "PATCH",
    { ids },
  );
  return response as ClientTypeItem[];
};
