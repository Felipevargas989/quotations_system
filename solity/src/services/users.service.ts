import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import { CreateUser } from "../types/users.types";

// TODO: mange the error better
export const getUser = async (userId: string) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}/${userId}`, "GET");
    return { data };
  } catch (error) {
    return { data: null, error };
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
