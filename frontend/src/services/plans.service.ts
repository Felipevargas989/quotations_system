import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

export const confirmPlan = async () => {
  const response = await apiRequest(`${API_ROUTES.PLAN_CONFIRMATION}`, "POST");
  return response;
};
