import { API_ROUTES } from "../constants/api.routes";
import {
  CreateServicesBulkDto,
  FixedService,
  VariableService,
} from "../types/services.types";
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

export const findAllServices = async (): Promise<{
  variableServices: VariableService[];
  fixedServices: FixedService[];
}> => {
  const response = await apiRequest(`${API_ROUTES.SERVICES}`, "GET");
  return response;
};
