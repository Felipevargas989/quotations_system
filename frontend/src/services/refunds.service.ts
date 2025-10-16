import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export const getRefunds = async () => {
  const response = await apiRequest(`${API_ROUTES.REFUNDS}`, "GET");
  return response;
};
