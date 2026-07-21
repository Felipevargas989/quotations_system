import { API_ROUTES } from "../constants/api.routes";
import { ClientFormData } from "../types/clients.types";
import { apiRequest } from "./api";

export const getClients = async () => {
  const response = await apiRequest(`${API_ROUTES.CLIENTS}`, "GET");
  return { data: response };
};

// Consulta compartida de React Query: lista de clientes (con
// quotation_count). Misma queryKey en todas las pantallas = un solo
// caché que se invalida tras cada guardado.
export const clientsQueryOptions = {
  queryKey: ["clients"] as const,
  queryFn: async () => {
    const { data } = await getClients();
    return data as import("../types/clients.types").Client[];
  },
};

export const createClient = async (client: ClientFormData) => {
  const response = await apiRequest(`${API_ROUTES.CLIENTS}`, "POST", client);
  return { data: response };
};

export const updateClient = async (client: ClientFormData, id: string) => {
  const response = await apiRequest(
    `${API_ROUTES.CLIENTS}/${id}`,
    "PATCH",
    client,
  );
  return { data: response };
};

export const deleteClient = async (id: string) => {
  const response = await apiRequest(`${API_ROUTES.CLIENTS}/${id}`, "DELETE");
  return { data: response };
};

// Ficha 360° del cliente: ficha + contactos + cotizaciones + cuotas
// impagas + encuestas, en una sola llamada.
export const getClientSummary = async (id: string) => {
  const response = await apiRequest(
    `${API_ROUTES.CLIENTS}/${id}/summary`,
    "GET",
  );
  return response;
};
