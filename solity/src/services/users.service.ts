import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// TODO: mange the error better
export const getUser = async (userId: string) => {
  try {
    const data = await apiRequest(`${API_ROUTES.USERS}/${userId}`, "GET");
    return { data };
  } catch (error) {
    return { data: null, error };
  }
};
