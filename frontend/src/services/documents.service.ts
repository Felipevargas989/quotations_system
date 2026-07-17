import { supabase } from "../lib/supabase";

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
  { key: "otros", label: "Otros" },
];

export const getDocumentsByQuotation = async (
  quotationId: string,
): Promise<EventDocument[]> => {
  const { data, error } = await supabase
    .from("event_documents")
    .select("*")
    .eq("quotation_id", quotationId)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("Error cargando documentos", error);
    return [];
  }
  return (data || []) as EventDocument[];
};

export const addDocument = async (doc: {
  quotation_id: string;
  category: string;
  file_name: string;
  file_url: string;
}): Promise<{ error: unknown }> => {
  const { error } = await supabase.from("event_documents").insert(doc);
  return { error };
};

export const deleteDocument = async (
  id: number,
): Promise<{ error: unknown }> => {
  const { error } = await supabase
    .from("event_documents")
    .delete()
    .eq("id", id);
  return { error };
};
