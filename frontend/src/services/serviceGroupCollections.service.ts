import { API_ROUTES } from "../constants/api.routes";
import {
  CambiosDePaquete,
  CreateServiceGroupCollection,
  GrupoDePaquetes,
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

/** Renombrar un paquete y/o cambiarlo de grupo (12-10-2026). */
export const actualizarPaquete = (
  id: ServiceGroupCollection["id"],
  cambios: CambiosDePaquete,
) =>
  apiRequest(`${API_ROUTES.SERVICE_GROUP_COLLECTIONS}/${id}`, "PATCH", cambios);

// ---------- GRUPOS DE PAQUETES (12-10-2026, migración 120) ----------
const GRUPOS = `${API_ROUTES.SERVICE_GROUP_COLLECTIONS}/grupos`;

export const getGruposDePaquetes = async (): Promise<GrupoDePaquetes[]> =>
  apiRequest(GRUPOS, "GET");

export const crearGrupoDePaquetes = (name: string) =>
  apiRequest(GRUPOS, "POST", { name });

export const renombrarGrupoDePaquetes = (
  id: GrupoDePaquetes["id"],
  name: string,
) => apiRequest(`${GRUPOS}/${id}`, "PATCH", { name });

/** El orden completo, de arriba abajo. */
export const ordenarGruposDePaquetes = (ids: GrupoDePaquetes["id"][]) =>
  apiRequest(`${GRUPOS}/orden`, "PATCH", { ids });

/** Sus paquetes no se borran: quedan sin grupo, en "Otros". */
export const borrarGrupoDePaquetes = (id: GrupoDePaquetes["id"]) =>
  apiRequest(`${GRUPOS}/${id}`, "DELETE");
