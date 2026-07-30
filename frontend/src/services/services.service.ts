import { API_ROUTES } from "../constants/api.routes";
import {
  CreateFixedService,
  CreateServicesBulkDto,
  CreateVariableService,
  FixedSection,
  FixedService,
  ServiceCategorySetting,
  UpdateFixedServiceDto,
  UpdateVariableServiceDto,
  VariableService,
  VariableServiceCategoryLink,
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
  categoryLinks?: VariableServiceCategoryLink[];
}> => {
  const response = await apiRequest(`${API_ROUTES.SERVICES}`, "GET");
  return response;
};

// Set the full set of categories a variable service belongs to (>= 1).
export const setServiceCategories = async (
  serviceId: number,
  categoryIds: number[],
) => {
  return apiRequest(
    `${API_ROUTES.SERVICES_VARIABLE}/${serviceId}/categories`,
    "PATCH",
    { category_ids: categoryIds },
  );
};

// Reorder variable services within a single category.
export const reorderServicesInCategory = async (
  categoryId: number,
  serviceIds: number[],
) => {
  return apiRequest(`${API_ROUTES.SERVICES}/reorder-services`, "PATCH", {
    category_id: categoryId,
    service_ids: serviceIds,
  });
};

// Reorder the categories themselves.
export const reorderCategories = async (categoryIds: number[]) => {
  return apiRequest(`${API_ROUTES.SERVICES}/reorder-categories`, "PATCH", {
    category_ids: categoryIds,
  });
};

// Create a category (find-or-create with typo dedup on the backend).
export const createCategory = async (name: string) => {
  return apiRequest(`${API_ROUTES.SERVICES_CATEGORIES}/new`, "POST", { name });
};

// Rename / toggle / reorder a single category by id.
export const updateCategoryById = async (
  id: number,
  fields: { name?: string; is_active?: boolean; sort_order?: number },
) => {
  return apiRequest(`${API_ROUTES.SERVICES_CATEGORIES}/${id}`, "PATCH", fields);
};

// Delete a category (blocked by the backend if services depend solely on it).
export const deleteCategoryById = async (id: number) => {
  return apiRequest(`${API_ROUTES.SERVICES_CATEGORIES}/${id}`, "DELETE");
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

// ---- Secciones de servicios fijos (migración 53) ----

export const getFixedSections = async (): Promise<FixedSection[]> => {
  const data = await apiRequest(`${API_ROUTES.SERVICES}/fixed-sections`, "GET");
  return (data || []) as FixedSection[];
};

export const createFixedSection = async (name: string) =>
  apiRequest(`${API_ROUTES.SERVICES}/fixed-sections/new`, "POST", { name });

export const updateFixedSection = async (
  id: number,
  fields: { name?: string; is_active?: boolean },
) => apiRequest(`${API_ROUTES.SERVICES}/fixed-sections/${id}`, "PATCH", fields);

export const deleteFixedSection = async (id: number) =>
  apiRequest(`${API_ROUTES.SERVICES}/fixed-sections/${id}`, "DELETE");

export const reorderFixedSections = async (sectionIds: number[]) =>
  apiRequest(`${API_ROUTES.SERVICES}/fixed-sections/reorder`, "PATCH", {
    section_ids: sectionIds,
  });

export const reorderFixedServices = async (
  sectionId: number | null,
  serviceIds: number[],
) =>
  apiRequest(`${API_ROUTES.SERVICES}/fixed/reorder`, "PATCH", {
    ...(sectionId !== null ? { section_id: sectionId } : {}),
    service_ids: serviceIds,
  });
