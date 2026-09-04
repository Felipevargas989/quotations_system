import { API_ROUTES } from "../constants/api.routes";
import { CreatePayment } from "../types/payments.types";
import { Quotation } from "../types/quotations.types";
import { apiRequest } from "./api";

// Get payments for a specific quotation
// Calendario de pagos Nivel A: solo fecha y nota de una cuota SIN
// dinero registrado (el backend rechaza el resto).
export const updatePaymentSchedule = async (
  paymentId: string,
  fields: { due_date?: string; notes?: string },
) => {
  try {
    const data = await apiRequest(
      `${API_ROUTES.PAYMENTS}/${paymentId}`,
      "PATCH",
      fields,
    );
    return { data, error: null as Error | null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getPaymentsByQuotationId = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.PAYMENTS}`,
    "GET",
    undefined,
    {
      quotationId,
    },
  );
  return { data: response };
};

export const createPaymentPlan = async (
  quotationId: Quotation["id"],
  payments: CreatePayment[],
) => {
  const response = await apiRequest(`${API_ROUTES.PAYMENTS_PLAN}`, "POST", {
    quotation_id: quotationId,
    payments,
  });
  return response;
};
