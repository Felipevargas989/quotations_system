import { API_ROUTES } from "../constants/api.routes";
import {
  CreateServiceGroupCollection,
  ServiceGroupCollection,
} from "../types/serviceGroupCollections.types";
import { apiRequest } from "./api";

export const getServiceGroupCollections = async (): Promise<
  ServiceGroupCollection[]
> => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICE_GROUP_COLLECTIONS}`,
    "GET",
  );
  return response;
};

export const createServiceGroupCollection = async (
  createDto: CreateServiceGroupCollection,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICE_GROUP_COLLECTIONS}`,
    "POST",
    createDto,
  );
  return response;
};

export const deleteServiceGroupCollection = async (
  id: ServiceGroupCollection["id"],
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICE_GROUP_COLLECTIONS}/${id}`,
    "DELETE",
  );
  return response;
};
