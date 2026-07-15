import { API_ROUTES } from "../constants/api.routes";
import {
  CreateFixedService,
  CreateServicesBulkDto,
  CreateVariableService,
  FixedService,
  ServiceCategorySetting,
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
  categories: ServiceCategorySetting[];
}> => {
  const response = await apiRequest(`${API_ROUTES.SERVICES}`, "GET");
  return response;
};

// Toggle a whole category's activation state (by name, scoped per company).
export const updateServiceCategory = async (
  name: string,
  is_active: boolean,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_CATEGORIES}`,
    "PATCH",
    { name, is_active },
  );
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

export const removeVariableService = async (id: VariableService["id"]) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_VARIABLE}/${id}`,
    "DELETE",
  );
  return response;
};

export const removeFixedService = async (id: FixedService["id"]) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICES_FIXED}/${id}`,
    "DELETE",
  );
  return response;
};
