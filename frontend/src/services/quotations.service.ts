import { API_ROUTES } from "../constants/api.routes";
import {
  Quotation,
  QuotationCreateData,
  QuotationFormDataUpdate,
  QuotationPublicFormData,
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../types/quotations.types";
import { apiRequest } from "./api";

export const getQuotations = async (
  requirementType?: QuotationRequestType,
  statuses?: QuotationStatus[],
  sort_by?: "quotation_number" | "event_date",
  sort_order?: "asc" | "desc",
) => {
  let requestTypeParam = "";
  if (requirementType !== undefined) {
    requestTypeParam = `request_type=${requirementType}`;
  }
  const statusesParam = statuses ? `&statuses=${statuses.join(",")}` : "";
  const sortByParam = sort_by ? `&sort_by=${sort_by}` : "";
  const sortOrderParam = sort_order ? `&sort_order=${sort_order}` : "";
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}?${requestTypeParam}${statusesParam}${sortByParam}${sortOrderParam}`,
    "GET",
  );
  return { data: response as QuotationWithClient[] };
};

// Declara el evento REALIZADO: cambia el estado y el backend envía la
// encuesta de satisfacción al cliente (una sola vez).
export interface MarkEventDoneResult {
  quotation_status: string;
  survey_sent: boolean;
  survey_already_sent: boolean;
  client_has_email: boolean;
}
export const markEventDone = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/realizado`,
    "POST",
  );
  return response as MarkEventDoneResult;
};

// La puerta de vuelta (solo administrador): des-marca un realizado.
export const unmarkEventDone = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/volver-a-pendiente`,
    "POST",
  );
  return response as { ok: boolean };
};

// La palabra final de Felipe sobre una fila de la cosecha del mes.
// `estado` en null borra la corrección y devuelve el mando a la
// sugerencia automática (cruce empresa + mandante + tipo de evento).
export const guardarEstadoCosecha = async (
  quotationId: string,
  estado: string | null,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/cosecha`,
    "POST",
    { estado },
  );
  return response as { ok: boolean; estado: string | null };
};

export const deleteQuotation = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}`,
    "DELETE",
  );

  return { error: response.error };
};

// Crear autenticado (POST /quotations). El tipo correcto es el del
// formulario INTERNO (Fase 2 Bloque C): antes decía por error
// QuotationPublicFormData, que es el del formulario público sin sesión.
export const createQuotation = async (quotation: QuotationCreateData) => {
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
  eventEndDate?: string,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS_CHECK_CONFLICTS}`,
    "GET",
    undefined,
    {
      event_date: eventDate,
      ...(eventEndDate ? { event_end_date: eventEndDate } : {}),
    },
  );
  return {
    data: response as { has_conflicts: boolean },
    error: response.error,
  };
};
