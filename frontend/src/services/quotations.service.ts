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
  statuses: QuotationStatus[],
) => {
  const statusesParam = statuses ? `&statuses=${statuses.join(",")}` : "";
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}?request_type=${requirementType}${statusesParam}`,
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

export const createQuotation = async (
  company_id: string,
  quotation: QuotationPublicFormData,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${company_id}`,
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
