import { API_ROUTES } from "../constants/api.routes";
import {
  CreateBlockedDaysDto,
  FindAllEventsResponse,
} from "../types/calendar.types";
import { apiRequest } from "./api";

export const createBlockedDays = async (
  createBlockedDaysDto: CreateBlockedDaysDto,
) => {
  const response = await apiRequest(
    `${API_ROUTES.CALENDAR_BLOCKED_DAYS}`,
    "POST",
    createBlockedDaysDto,
  );
  return response;
};

export const findAllEvents = async (): Promise<FindAllEventsResponse> => {
  const response = await apiRequest(`${API_ROUTES.CALENDAR_EVENTS}`, "GET");
  return response;
};
