import { API_ROUTES } from "../constants/api.routes";
import { CreateServiceGroup, ServiceGroup } from "../types/serviceGroups.types";
import { apiRequest } from "./api";

export const getServiceGroups = async (): Promise<ServiceGroup[]> => {
  const response = await apiRequest(`${API_ROUTES.SERVICE_GROUPS}`, "GET");
  return response;
};

export const createServiceGroup = async (
  createServiceGroupDto: CreateServiceGroup,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICE_GROUPS}`,
    "POST",
    createServiceGroupDto,
  );
  return response;
};

export const deleteServiceGroup = async (id: ServiceGroup["id"]) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICE_GROUPS}/${id}`,
    "DELETE",
  );
  return response;
};
