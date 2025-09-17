import { API_ROUTES } from "../constants/api.routes";
import {
  CreateFixedService,
  CreateServicesBulkDto,
  CreateVariableService,
  FixedService,
  UpdateFixedServiceDto,
  UpdateVariableServiceDto,
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

export const updateFixedService = async (
  id: FixedService["id"],
  updateFixedServiceDto: UpdateFixedServiceDto,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_FIXED}/${id}`,
    "PATCH",
    updateFixedServiceDto,
  );
  return response;
};

export const updateVariableService = async (
  id: VariableService["id"],
  updateVariableServiceDto: UpdateVariableServiceDto,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_VARIABLE}/${id}`,
    "PATCH",
    updateVariableServiceDto,
  );
  return response;
};

export const createVariableService = async (
  createVariableServiceDto: CreateVariableService,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_VARIABLE}`,
    "POST",
    createVariableServiceDto,
  );
  return response;
};

export const createFixedService = async (
  createFixedServiceDto: CreateFixedService,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_FIXED}`,
    "POST",
    createFixedServiceDto,
  );
  return response;
};
