import { API_ROUTES } from "../constants/api.routes";
import {
  CreateServiceGroup,
  GrupoDeMenus,
  ServiceGroup,
} from "../types/serviceGroups.types";
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

export const renameServiceGroup = async (
  id: ServiceGroup["id"],
  name: string,
) => {
  const response = await apiRequest(
    `${API_ROUTES.SERVICE_GROUPS}/${id}`,
    "PATCH",
    { name },
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

/** Cambiar un menú de grupo (12-10-2026); null lo deja sin grupo. */
export const asignarGrupoAlMenu = (
  id: ServiceGroup["id"],
  menuGroupId: GrupoDeMenus["id"] | null,
) =>
  apiRequest(`${API_ROUTES.SERVICE_GROUPS}/${id}/grupo`, "PATCH", {
    menu_group_id: menuGroupId,
  });

// ---------- GRUPOS DE MENÚS GUARDADOS (12-10-2026, migración 121) ----------
const GRUPOS = `${API_ROUTES.SERVICE_GROUPS}/grupos`;

/** Todos los de la empresa, de todas las categorías. */
export const getGruposDeMenus = async (): Promise<GrupoDeMenus[]> =>
  apiRequest(GRUPOS, "GET");

export const crearGrupoDeMenus = (category: string, name: string) =>
  apiRequest(GRUPOS, "POST", { category, name });

export const renombrarGrupoDeMenus = (id: GrupoDeMenus["id"], name: string) =>
  apiRequest(`${GRUPOS}/${id}`, "PATCH", { name });

/** El orden completo de UNA categoría, de arriba abajo. */
export const ordenarGruposDeMenus = (
  category: string,
  ids: GrupoDeMenus["id"][],
) => apiRequest(`${GRUPOS}/orden`, "PATCH", { category, ids });

/** Sus menús no se borran: quedan sin grupo, en "Otros". */
export const borrarGrupoDeMenus = (id: GrupoDeMenus["id"]) =>
  apiRequest(`${GRUPOS}/${id}`, "DELETE");
