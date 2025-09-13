import { API_ROUTES } from "../constants/api.routes";
import { ClientFormData } from "../types/clients.types";
import { apiRequest } from "./api";

export const getClients = async () => {
  const response = await apiRequest(`${API_ROUTES.CLIENTS}`, "GET");
  return { data: response };
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
