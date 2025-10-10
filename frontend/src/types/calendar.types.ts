import { Quotation } from "./quotations.types";

export interface CreateBlockedDaysDto {
  date: string; // YYYY-MM-DD format
}

export interface FindAllEventsResponse {
  quotations: Quotation[];
}
