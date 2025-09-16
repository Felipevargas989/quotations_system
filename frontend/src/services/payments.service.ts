import { API_ROUTES } from "../constants/api.routes";
import { CreatePayment } from "../types/payments.types";
import { Quotation } from "../types/quotations.types";
import { apiRequest } from "./api";

// Get payments for a specific quotation
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

// Delete payment and all its related transactions
export const deletePayment = async (
  paymentId: string,
  transactions: any[] = [],
) => {
  try {
    const { error } = await apiRequest(
      `${API_ROUTES.PAYMENTS}/${paymentId}`,
      "DELETE",
    );

    if (error) throw error;

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error };
  }
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
