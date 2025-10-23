import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import {
  DashboardStatsResponse,
  CompleteStatsResponse,
} from "../types/analytics.types";

export const getDashboardStats = async (
  start_date?: string,
  end_date?: string,
): Promise<DashboardStatsResponse | null> => {
  const queryParams = new URLSearchParams();
  if (start_date) {
    queryParams.append("start_date", start_date);
  }
  if (end_date) {
    queryParams.append("end_date", end_date);
  }
  const response = await apiRequest(
    `${API_ROUTES.ANALYTICS_DASHBOARD}?${queryParams.toString()}`,
    "GET",
  );
  return response || null;
};

export const getCompleteStats = async (
  start_date?: string,
  end_date?: string,
): Promise<CompleteStatsResponse | null> => {
  const queryParams = new URLSearchParams();
  if (start_date) {
    queryParams.append("start_date", start_date);
  }
  if (end_date) {
    queryParams.append("end_date", end_date);
  }
  const response = await apiRequest(
    `${API_ROUTES.ANALYTICS_COMPLETE_STATS}?${queryParams.toString()}`,
    "GET",
  );
  return response || null;
};
