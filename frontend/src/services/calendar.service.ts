import { API_ROUTES } from "../constants/api.routes";
import { FindAllEventsResponse } from "../types/calendar.types";
import { apiRequest } from "./api";

export const findAllEvents = async (): Promise<FindAllEventsResponse> => {
  const response = await apiRequest(`${API_ROUTES.CALENDAR_EVENTS}`, "GET");
  return response;
};
