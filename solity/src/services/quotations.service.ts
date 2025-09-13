import { supabase } from "../lib/supabase";
import {
  Quotation,
  QuotationFormData,
  QuotationFormDataUpdate,
  QuotationRequestType,
} from "../types/quotations.types";

export const getQuotations = async (
  companyId: string,
  requirementType: QuotationRequestType,
) => {
  const { data, error } = await supabase
    .from("quotations")
    .select("*")
    .eq("request_type", requirementType)
    .eq("company_id", companyId);
  return { data, error };
};

export const deleteQuotation = async (
  quotationId: string,
  companyId: string,
) => {
  const { error } = await supabase
    .from("quotations")
    .delete()
    .eq("id", quotationId)
    .eq("company_id", companyId);
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
