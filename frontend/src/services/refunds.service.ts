import { API_ROUTES } from "../constants/api.routes";
import { Refund } from "../types/refunds.types";
import { apiRequest } from "./api";

export const getRefunds = async () => {
  const response = await apiRequest(`${API_ROUTES.REFUNDS}`, "GET");
  return response;
};

// MUDANZA #7 (28-07): reembolsos por el backend, acotados a la empresa
// (la versión directa sumaba devoluciones de TODAS las empresas).
export const getRefundsByQuotation = async (
  quotationId: string,
): Promise<Refund[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.REFUNDS_BY_QUOTATION,
      "GET",
      undefined,
      { quotationId },
    );
    return (data || []) as Refund[];
  } catch {
    return [];
  }
};

// Suma de reembolsos YA PAGADOS agrupada por cotización (de la empresa).
export const getPaidRefundsByQuotation = async (): Promise<
  Record<string, number>
> => {
  try {
    const data = await apiRequest(API_ROUTES.REFUNDS_PAID_MAP, "GET");
    return (data || {}) as Record<string, number>;
  } catch {
    return {};
  }
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
  try {
    await apiRequest(`${API_ROUTES.REFUNDS}/${id}/register`, "PATCH", fields);
    return { error: null };
  } catch (error) {
    return { error };
  }
};
