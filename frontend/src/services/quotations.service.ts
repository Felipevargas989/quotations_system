import { API_ROUTES } from "../constants/api.routes";
import {
  Quotation,
  QuotationFormData,
  QuotationFormDataUpdate,
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../types/quotations.types";
import { apiRequest } from "./api";

export const getQuotations = async (
  requirementType: QuotationRequestType,
  statuses: QuotationStatus[],
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}?request_type=${requirementType}${statuses ? `&statuses=${statuses.join(",")}` : ""}`,
    "GET",
  );
  return { data: response as QuotationWithClient[] };
};

export const deleteQuotation = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}`,
    "DELETE",
  );

  return { error: response.error };
};

export const createQuotation = async (quotation: QuotationFormData) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}`,
    "POST",
    quotation,
  );
  return { data: response as Quotation, error: response.error };
};

export const updateQuotation = async (
  quotation: QuotationFormDataUpdate,
  quotationId: string,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}`,
    "PATCH",
    quotation,
  );
  return { data: response as Quotation, error: response.error };
};

export const getQuotationById = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}`,
    "GET",
  );
  return { data: response.data as Quotation, error: response.error };
};

export const checkConflictsWithExistingQuotations = async (
  eventDate: Quotation["event_date"],
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS_CHECK_CONFLICTS}`,
    "GET",
    undefined,
    { event_date: eventDate },
  );
  return {
    data: response as { has_conflicts: boolean },
    error: response.error,
  };
};
