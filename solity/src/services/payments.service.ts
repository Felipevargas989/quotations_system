import { API_ROUTES } from "../constants/api.routes";
import { CreatePayment } from "../types/payments.types";
import { supabase } from "../lib/supabase";
import { Quotation } from "../types/quotations.types";
import { apiRequest } from "./api";

export const getPayments = async () => {
  // Obtener TODOS los pagos con información de cotizaciones
  const { data: paymentsData, error: paymentsError } = await supabase.from(
    "payments",
  ).select(`
          *,
          quotations!inner(
            quotation_number,
            event_date,
            total_amount,
            requires_invoice,
            has_contract
          )
        `);

  // Sort by quotation_number if data exists and no error
  if (paymentsData && !paymentsError) {
    paymentsData.sort((a: any, b: any): number => {
      const aNumber = a.quotations?.quotation_number || 0;
      const bNumber = b.quotations?.quotation_number || 0;

      // Numeric sorting for quotation numbers
      return aNumber - bNumber;
    });
  }

  return { data: paymentsData, error: paymentsError };
};

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

// Update payment amount
export const updatePaymentAmount = async (
  paymentId: string,
  newAmount: number,
) => {
  const { data, error } = await supabase
    .from("payments")
    .update({ amount: newAmount })
    .eq("id", paymentId)
    .select()
    .single();

  return { data, error };
};

// Get the next payment number for a quotation
export const getNextPaymentNumber = async (quotationId: string) => {
  const { data: existingPayments, error } = await supabase
    .from("payments")
    .select("payment_number")
    .eq("quotation_id", quotationId)
    .order("payment_number", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error getting next payment number:", error);
    return 1; // Default to 1 if error
  }

  if (existingPayments && existingPayments.length > 0) {
    return (existingPayments[0].payment_number || 0) + 1;
  }

  return 1; // First payment for this quotation
};

// Create new payment
export const createPayment = async (
  quotationId: string,
  amount: number,
  notes: string,
) => {
  // Get the next payment number for this quotation
  const paymentNumber = await getNextPaymentNumber(quotationId);

  // Get quotation details to calculate due_date
  const { data: quotation, error: quotationError } = await supabase
    .from("quotations")
    .select("event_date")
    .eq("id", quotationId)
    .single();

  if (quotationError) {
    console.error("Error fetching quotation for due_date:", quotationError);
    throw quotationError;
  }

  // Calculate due_date: if event_date exists, use 1 week after event date; otherwise use today
  let dueDate;
  if (quotation.event_date) {
    const eventDate = new Date(quotation.event_date);
    const oneWeekLater = new Date(
      eventDate.getTime() + 7 * 24 * 60 * 60 * 1000,
    ); // Add 7 days
    dueDate = oneWeekLater.toISOString().split("T")[0];
  } else {
    dueDate = new Date().toISOString().split("T")[0]; // Today's date in YYYY-MM-DD format
  }

  const { data, error } = await supabase
    .from("payments")
    .insert({
      quotation_id: quotationId,
      payment_number: paymentNumber,
      amount: amount,
      due_date: dueDate,
      notes: notes,
      status: "pendiente",
    })
    .select()
    .single();

  return { data, error };
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

// Check and update overdue payments
export const checkAndUpdateOverduePayments = async (companyId: number) => {
  try {
    console.log("checkAndUpdateOverduePayments", companyId);
    const today = new Date().toISOString().split("T")[0]; // Today's date in YYYY-MM-DD format

    // Get all pending payments that are overdue
    const { data: overduePayments, error: fetchError } = await supabase
      .from("payments")
      .select(
        "id, payment_number, due_date, status, quotations!inner(quotation_number)",
      )
      .eq("status", "pendiente")
      .eq("quotations.company_id", companyId)
      .lt("due_date", today);

    if (fetchError) {
      console.error("Error fetching overdue payments:", fetchError);
      return { success: false, error: fetchError, updatedCount: 0 };
    }

    if (!overduePayments || overduePayments.length === 0) {
      console.log("✅ No overdue payments found");
      return { success: true, error: null, updatedCount: 0 };
    }

    console.log(
      `🔄 Found ${overduePayments.length} overdue payments to update`,
    );

    // Update all overdue payments to 'vencido' status
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "vencido" })
      .eq("status", "pendiente")
      .eq("quotations.company_id", companyId)
      .lt("due_date", today);

    if (updateError) {
      console.error("Error updating overdue payments:", updateError);
      return { success: false, error: updateError, updatedCount: 0 };
    }

    console.log(
      `✅ Successfully updated ${overduePayments.length} payments to 'vencido' status`,
    );

    return {
      success: true,
      error: null,
      updatedCount: overduePayments.length,
      updatedPayments: overduePayments,
    };
  } catch (error) {
    console.error("Error in checkAndUpdateOverduePayments:", error);
    return { success: false, error, updatedCount: 0 };
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
