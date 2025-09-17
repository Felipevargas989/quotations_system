import { API_ROUTES } from "../constants/api.routes";
import { CreateServicesBulkDto } from "../types/services.types";
import { apiRequest } from "./api";

// Implement post bulk create services
export const createServicesBulk = async (services: CreateServicesBulkDto) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_BULK}`,
    "POST",
    services,
  );
  return response;
};

export const findAllServices = async () => {
  const response = await apiRequest(`${API_ROUTES.SERVICES}`, "GET");
  return response;
};
