import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export const updateCompany = async (name: string, logo_url?: string) => {
  const response = await apiRequest(`${API_ROUTES.COMPANIES}`, "PATCH", {
    name,
    logo_url,
  });
  return { data: response };
};
