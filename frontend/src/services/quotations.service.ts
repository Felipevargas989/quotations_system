import { API_ROUTES } from "../constants/api.routes";
import {
  Quotation,
  QuotationFormDataUpdate,
  QuotationPublicFormData,
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../types/quotations.types";
import { apiRequest } from "./api";

export const getQuotations = async (
  requirementType: QuotationRequestType,
  sort_by?: "quotation_number" | "event_date" | "status",
  sort_order?: "asc" | "desc",
) => {
  const sortByParam = sort_by ? `&sort_by=${sort_by}` : "";
  const sortOrderParam = sort_order ? `&sort_order=${sort_order}` : "";
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}?request_type=${requirementType}${sortByParam}${sortOrderParam}`,
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

export const createQuotation = async (quotation: QuotationPublicFormData) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}`,
    "POST",
    quotation,
  );
  return { data: response as Quotation, error: response.error };
};

export const createQuotationPublic = async (
  companyId: string,
  quotation: QuotationPublicFormData,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/public/${companyId}`,
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
  eventDate: string,
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
