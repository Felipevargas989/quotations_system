import { API_ROUTES } from "../constants/api.routes";
import { Client } from "../types/clients.types";
import { CreatePaymentTransaction } from "../types/paymentsTransactions.types";
import { Refund } from "../types/refunds.types";
import { apiRequest } from "./api";

// TODO: Move this to the types folder
export interface PaymentTransaction {
  id: number;
  payment_id: string;
  quotation_id: string;
  amount: number;
  payment_method: string;
  transaction_date: string;
  reference_number?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  receipt_photo_url?: string;
}

// TODO: Move this to the types folder
export interface PaymentWithTransactions {
  id: string;
  quotation_id: string;
  payment_number: number;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: string;
  payment_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  payment_method: string | null;
  // Calculated fields (not stored in database)
  paid_amount: number; // Calculated from payment_transactions
  payment_count: number; // Number of transactions
  last_payment_date: string | null; // Date of last transaction
  transactions: PaymentTransaction[];
  quotations: {
    quotation_number: number;
    total_amount: number;
    requires_invoice: boolean;
    has_contract: boolean;
    clients: Pick<Client, "name">;
  };
  refunds: Refund[];
}

export const createPaymentTransaction = async (
  transaction: CreatePaymentTransaction,
) => {
  try {
    const response = await apiRequest(
      `${API_ROUTES.PAYMENTS_TRANSACTIONS}`,
      "POST",
      transaction,
    );

    return { data: response };
  } catch (error) {
    console.error("Error creating payment transaction:", error);
    throw error;
  }
};

export const getPaymentsWithTransactions = async (): Promise<{
  data: PaymentWithTransactions[];
}> => {
  try {
    const response = await apiRequest(
      `${API_ROUTES.PAYMENTS_TRANSACTIONS}`,
      "GET",
    );
    return { data: response };
  } catch (error) {
    throw error;
  }
};

// Registro de pago con "derrame": el backend reparte el monto en cascada por
// las cuotas pendientes (de la más próxima hacia adelante) y envía UN correo.
export interface OverflowPaymentResult {
  total: number;
  distribution: {
    payment_id: string;
    payment_number: number;
    amount: number;
    fully_paid: boolean;
  }[];
}

export const createOverflowPayment = async (payload: {
  quotation_id: string;
  amount: number;
  payment_method: string;
  transaction_date: string;
  notes?: string;
  receipt_photo_url?: string;
}): Promise<{ data: OverflowPaymentResult }> => {
  try {
    const response = await apiRequest(
      `${API_ROUTES.PAYMENTS_TRANSACTIONS_OVERFLOW}`,
      "POST",
      payload,
    );
    return { data: response };
  } catch (error) {
    console.error("Error creating overflow payment:", error);
    throw error;
  }
};

export const deletePaymentTransaction = async (transactionId: number) => {
  try {
    const { error } = await apiRequest(
      `${API_ROUTES.PAYMENTS_TRANSACTIONS}/${transactionId}`,
      "DELETE",
    );

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error deleting payment transaction:", error);
    throw error;
  }
};

export const updatePaymentTransaction = async (
  transactionId: number,
  updates: {
    amount: number;
    payment_method: string;
    transaction_date: string;
    notes?: string;
    receipt_photo_url?: string;
  },
) => {
  const response = await apiRequest(
    `${API_ROUTES.PAYMENTS_TRANSACTIONS}/${transactionId}`,
    "PATCH",
    updates,
  );
  return { data: response };
};
