import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import { CreateUser, UpdateUser, UserWithCompany } from "../types/users.types";

// TODO: mange the error better
export const getUser = async (
  userId: string,
): Promise<{ data: UserWithCompany | null; error: Error | null }> => {
  try {
    const response: UserWithCompany = await apiRequest(
      `${API_ROUTES.USERS}/${userId}`,
      "GET",
    );
    return { data: response, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getUsers = async () => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}`, "GET");
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};

export const createUser = async (user: CreateUser) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}`, "POST", user);
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};

export const updateUser = async (id: string, user: UpdateUser) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}/${id}`, "PATCH", user);
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};

export const deleteUser = async (id: string) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}/${id}`, "DELETE");
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};
