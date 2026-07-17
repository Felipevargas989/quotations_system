import { API_ROUTES } from "../constants/api.routes";
import { supabase } from "../lib/supabase";
import { Refund } from "../types/refunds.types";
import { apiRequest } from "./api";

export const getRefunds = async () => {
  const response = await apiRequest(`${API_ROUTES.REFUNDS}`, "GET");
  return response;
};

// Reembolsos de una cotización (los crea el backend al bajar el total; aquí se
// completan con fecha / medio de pago / comprobante).
export const getRefundsByQuotation = async (
  quotationId: string,
): Promise<Refund[]> => {
  const { data, error } = await supabase
    .from("refunds")
    .select("*")
    .eq("quotation_id", quotationId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error cargando reembolsos", error);
    return [];
  }
  return (data || []) as Refund[];
};

// Suma de reembolsos YA PAGADOS (is_paid = true) agrupada por cotización.
// Se usa para descontar del "pagado" y que el saldo vuelva a 0 tras devolver.
export const getPaidRefundsByQuotation = async (): Promise<
  Record<string, number>
> => {
  const { data, error } = await supabase
    .from("refunds")
    .select("quotation_id, amount, is_paid")
    .eq("is_paid", true);
  if (error) {
    console.error("Error cargando reembolsos pagados", error);
    return {};
  }
  const map: Record<string, number> = {};
  (data || []).forEach((r: { quotation_id: string; amount: number }) => {
    map[r.quotation_id] = (map[r.quotation_id] || 0) + (r.amount || 0);
  });
  return map;
};

// Registra (completa) un reembolso: fecha, medio de pago, monto y comprobante.
export const registerRefund = async (
  id: string | number,
  fields: {
    amount: number;
    refund_date: string;
    payment_method: string;
    receipt_url?: string | null;
  },
): Promise<{ error: unknown }> => {
  const { error } = await supabase
    .from("refunds")
    .update({ ...fields, is_paid: true })
    .eq("id", id);
  return { error };
};
