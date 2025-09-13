import { API_ROUTES } from "../constants/api.routes";
import { supabase } from "../lib/supabase";
import {
  Quotation,
  QuotationFormData,
  QuotationFormDataUpdate,
  QuotationRequestType,
} from "../types/quotations.types";
import { apiRequest } from "./api";

export const getQuotations = async (requirementType: QuotationRequestType) => {
  // const { data, error } = await supabase
  //   .from("quotations")
  //   .select("*")
  //   .eq("request_type", requirementType)
  //   .eq("company_id", companyId);
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}?request_type=${requirementType}`,
    "GET",
  );
  return { data: response };
};

export const deleteQuotation = async (quotationId: string) => {
  const { error } = await supabase
    .from("quotations")
    .delete()
    .eq("id", quotationId);
  return { error };
};

export const createQuotation = async (quotation: QuotationFormData) => {
  const { data, error } = await supabase
    .from("quotations")
    .insert([quotation])
    .select()
    .single();
  return { data: data as Quotation, error };
};

export const updateQuotation = async (
  quotation: QuotationFormDataUpdate,
  quotationId: string,
) => {
  const { data, error } = await supabase
    .from("quotations")
    .update(quotation)
    .eq("id", quotationId)
    .select()
    .single();
  return { data: data as Quotation, error };
};
