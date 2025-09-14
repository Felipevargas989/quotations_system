import { API_ROUTES } from "../constants/api.routes";
import { supabase } from "../lib/supabase";
import { CreatePaymentTransaction } from "../types/paymentsTransactions.types";
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
    client_name: string;
    total_amount: number;
    requires_invoice: boolean;
    has_contract: boolean;
  };
}

export const createPaymentTransaction = async (
  transaction: CreatePaymentTransaction,
) => {
  try {
    // // Validate amount
    // if (!transaction.amount || transaction.amount <= 0) {
    //   throw new Error("El monto debe ser mayor a 0");
    // }

    // if (!transaction.payment_method) {
    //   throw new Error("El método de pago es requerido");
    // }

    // // Get payment details to validate against limits
    // const { data: payment, error: paymentError } = await supabase
    //   .from("payments")
    //   .select("amount")
    //   .eq("id", transaction.payment_id)
    //   .single();

    // if (paymentError) throw paymentError;
    // if (!payment) throw new Error("Pago no encontrado");

    // // Get all current transactions for this payment to calculate current total
    // const { data: currentTransactions, error: transactionsError } =
    //   await supabase
    //     .from("payment_transactions")
    //     .select("amount")
    //     .eq("payment_id", transaction.payment_id);

    // if (transactionsError) throw transactionsError;

    // // Calculate current total paid
    // const currentTotalPaid = (currentTransactions || []).reduce(
    //   (sum, t) => sum + t.amount,
    //   0,
    // );

    // // Validate that new total doesn't exceed payment amount
    // const newTotalPaid = currentTotalPaid + transaction.amount;
    // if (newTotalPaid > payment.amount) {
    //   throw new Error(
    //     `El monto total pagado no puede exceder $${payment.amount.toLocaleString()}`,
    //   );
    // }

    // // Create the transaction
    // const { data, error } = await supabase
    //   .from("payment_transactions")
    //   .insert([
    //     {
    //       payment_id: transaction.payment_id,
    //       quotation_id: transaction.quotation_id,
    //       amount: transaction.amount,
    //       payment_method: transaction.payment_method,
    //       transaction_date: transaction.transaction_date,
    //       notes: transaction.notes,
    //       receipt_photo_url: transaction.receipt_photo_url,
    //       created_by:
    //         (await supabase.auth.getUser()).data.user?.id || "unknown",
    //     },
    //   ])
    //   .select()
    //   .single();

    // if (error) throw error;

    // // Update the payment's status based on new total
    // const { error: updatePaymentError } = await supabase
    //   .from("payments")
    //   .update({
    //     status: newTotalPaid >= payment.amount ? "pagado" : "pendiente",
    //     updated_at: new Date().toISOString(),
    //   })
    //   .eq("id", transaction.payment_id);

    // if (updatePaymentError) throw updatePaymentError;
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

export const deletePaymentTransaction = async (transactionId: number) => {
  try {
    const { error } = await supabase
      .from("payment_transactions")
      .delete()
      .eq("id", transactionId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error deleting payment transaction:", error);
    throw error;
  }
};

export const deletePaymentTransactionsByPaymentId = async (
  paymentId: string,
) => {
  try {
    const { error } = await supabase
      .from("payment_transactions")
      .delete()
      .eq("payment_id", paymentId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error deleting payment transactions by payment ID:", error);
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
  // try {
  //   // Validate amount
  //   if (!updates.amount || updates.amount <= 0) {
  //     throw new Error("El monto debe ser mayor a 0");
  //   }

  //   if (!updates.payment_method) {
  //     throw new Error("El método de pago es requerido");
  //   }

  //   // Get the current transaction to validate against payment limits
  //   const { data: currentTransaction, error: fetchError } = await supabase
  //     .from("payment_transactions")
  //     .select("payment_id, amount")
  //     .eq("id", transactionId)
  //     .single();

  //   if (fetchError) throw fetchError;
  //   if (!currentTransaction) throw new Error("Transacción no encontrada");

  //   // Get payment details to validate new total
  //   const { data: payment, error: paymentError } = await supabase
  //     .from("payments")
  //     .select("amount")
  //     .eq("id", currentTransaction.payment_id)
  //     .single();

  //   if (paymentError) throw paymentError;
  //   if (!payment) throw new Error("Pago no encontrado");

  //   // Get all current transactions for this payment to calculate current total
  //   const { data: currentTransactions, error: transactionsError } =
  //     await supabase
  //       .from("payment_transactions")
  //       .select("amount")
  //       .eq("payment_id", currentTransaction.payment_id);

  //   if (transactionsError) throw transactionsError;

  //   // Calculate current total paid (excluding the transaction being updated)
  //   const currentTotalPaid = (currentTransactions || [])
  //     .filter((t) => t.amount !== currentTransaction.amount) // Exclude the current transaction amount
  //     .reduce((sum, t) => sum + t.amount, 0);

  //   // Calculate new total paid amount
  //   const newTotalPaid = currentTotalPaid + updates.amount;

  //   // Validate that new total doesn't exceed payment amount
  //   if (newTotalPaid > payment.amount) {
  //     throw new Error(
  //       `El monto total pagado no puede exceder $${payment.amount.toLocaleString()}`,
  //     );
  //   }

  //   // Update the transaction
  //   const { data, error } = await supabase
  //     .from("payment_transactions")
  //     .update({
  //       amount: updates.amount,
  //       payment_method: updates.payment_method,
  //       transaction_date: updates.transaction_date,
  //       notes: updates.notes,
  //       receipt_photo_url: updates.receipt_photo_url,
  //     })
  //     .eq("id", transactionId)
  //     .select()
  //     .single();

  //   if (error) throw error;

  //   // Update the payment's status based on new total
  //   const { error: updatePaymentError } = await supabase
  //     .from("payments")
  //     .update({
  //       status: newTotalPaid >= payment.amount ? "pagado" : "pendiente",
  //       updated_at: new Date().toISOString(),
  //     })
  //     .eq("id", currentTransaction.payment_id);

  //   if (updatePaymentError) throw updatePaymentError;

  //   return data;
  // } catch (error) {
  //   console.error("Error updating payment transaction:", error);
  //   throw error;
  // }
  const response = await apiRequest(
    `${API_ROUTES.PAYMENTS_TRANSACTIONS}/${transactionId}`,
    "PATCH",
    updates,
  );
  return { data: response };
};
