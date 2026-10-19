import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// Fase 2b del portal: comprobantes que el CLIENTE subió y esperan
// confirmación del equipo. Confirmar registra el pago real (backend).

export interface PortalReceipt {
  id: number;
  quotation_id: string;
  payment_id: string | null;
  file_url: string;
  declared_amount: number;
  status: string;
  created_at: string;
  quotations?: {
    quotation_number: number;
    event_type?: string | null;
    clients?: { name: string } | null;
  } | null;
  payments?: { payment_number: number; amount: number } | null;
  client_contacts?: { name: string } | null;
}

export const listPortalReceipts = async (): Promise<PortalReceipt[]> => {
  try {
    const data = await apiRequest(API_ROUTES.PORTAL_RECEIPTS, "GET");
    return (data || []) as PortalReceipt[];
  } catch {
    return [];
  }
};

export const confirmPortalReceipt = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.PORTAL_RECEIPTS}/${id}/confirmar`, "POST", {});
    return { error: null as unknown };
  } catch (error) {
    return { error };
  }
};

export const rejectPortalReceipt = async (id: number, note?: string) => {
  try {
    await apiRequest(`${API_ROUTES.PORTAL_RECEIPTS}/${id}/rechazar`, "POST", {
      note,
    });
    return { error: null as unknown };
  } catch (error) {
    return { error };
  }
};
