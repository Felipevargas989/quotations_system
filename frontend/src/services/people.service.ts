import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type {
  Persona,
  PersonaFormData,
  Cargo,
} from "../types/people.types";

/* ------------------------------------------------------------------ *
 * PERSONAS
 * ------------------------------------------------------------------ */

export const getPeople = async () =>
  (await apiRequest(API_ROUTES.PEOPLE, "GET")) as Persona[];

export const getPerson = async (id: number) =>
  (await apiRequest(`${API_ROUTES.PEOPLE}/${id}`, "GET")) as Persona;

export const createPerson = async (persona: PersonaFormData) =>
  (await apiRequest(API_ROUTES.PEOPLE, "POST", persona)) as Persona;

export const updatePerson = async (id: number, persona: PersonaFormData) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE}/${id}`,
    "PATCH",
    persona,
  )) as Persona;

export const deletePerson = async (id: number) =>
  apiRequest(`${API_ROUTES.PEOPLE}/${id}`, "DELETE");

/** La misma queryKey en todas las pantallas = un solo caché que se
 *  invalida tras cada guardado. Igual que en clientes. */
export const peopleQueryOptions = {
  queryKey: ["people"] as const,
  queryFn: getPeople,
};

/* ------------------------------------------------------------------ *
 * CARGOS
 * ------------------------------------------------------------------ */

export const getRoles = async (incluirApagados = false) =>
  (await apiRequest(
    incluirApagados
      ? `${API_ROUTES.PEOPLE_ROLES}?todos=true`
      : API_ROUTES.PEOPLE_ROLES,
    "GET",
  )) as Cargo[];

export const createRole = async (name: string) =>
  (await apiRequest(API_ROUTES.PEOPLE_ROLES, "POST", { name })) as Cargo;

export const updateRole = async (
  id: number,
  cambios: { name?: string; is_active?: boolean; sort_order?: number },
) =>
  (await apiRequest(
    `${API_ROUTES.PEOPLE_ROLES}/${id}`,
    "PATCH",
    cambios,
  )) as Cargo;

/** Un cargo se APAGA, no se borra: si alguien lo tiene como cargo por
 *  defecto, borrarlo dejaría esa ficha apuntando a la nada. */
export const deactivateRole = async (id: number) =>
  apiRequest(`${API_ROUTES.PEOPLE_ROLES}/${id}`, "DELETE");

export const rolesQueryOptions = {
  queryKey: ["people", "roles"] as const,
  queryFn: () => getRoles(),
};
