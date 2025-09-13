import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export const getUser = async (userId: string) => {
  const { data, error } = await apiRequest(
    `${API_ROUTES.USERS}/${userId}`,
    "GET",
    { userId },
  );

  return { data, error };
};
