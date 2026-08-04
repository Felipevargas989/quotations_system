import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";

// MUDANZA #7 (28-07): documentos del evento por el backend (la
// pertenencia a la empresa se verifica vía la cotización).

export interface EventDocument {
  id: number;
  quotation_id: string;
  category: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

// Categorías de documentos del evento.
export const DOCUMENT_CATEGORIES: { key: string; label: string }[] = [
  { key: "contratos", label: "Contratos" },
  { key: "ordenes_compra", label: "Órdenes de compra" },
  { key: "facturas", label: "Facturas" },
  // Respaldo de la negociación (ficha del negocio, 04-08): pantallazos
  // de WhatsApp, correos del cliente — la evidencia comercial.
  { key: "comercial", label: "Comercial" },
  { key: "otros", label: "Otros" },
];

export const getDocumentsByQuotation = async (
  quotationId: string,
): Promise<EventDocument[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.EVENT_DOCUMENTS,
      "GET",
      undefined,
      { quotationId },
    );
    return (data || []) as EventDocument[];
  } catch {
    return [];
  }
};

export const addDocument = async (doc: {
  quotation_id: string;
  category: string;
  file_name: string;
  file_url: string;
}): Promise<{ error: unknown }> => {
  try {
    await apiRequest(API_ROUTES.EVENT_DOCUMENTS, "POST", doc);
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteDocument = async (
  id: number,
): Promise<{ error: unknown }> => {
  try {
    await apiRequest(`${API_ROUTES.EVENT_DOCUMENTS}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};
