import { supabase } from "../lib/supabase";
import { CategorySection } from "../types/services.types";

// Secciones de categoría (Entradas / Fondos / Postres...). Acceso directo a
// Supabase, mismo patrón que logistics.service.

export const getCategorySections = async (
  companyId: number,
): Promise<CategorySection[]> => {
  const { data, error } = await supabase
    .from("category_sections")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order");
  if (error) {
    console.error("Error cargando secciones", error);
    return [];
  }
  return (data || []) as CategorySection[];
};

export const createCategorySection = async (fields: {
  company_id: number;
  category_id: number;
  name: string;
  sort_order: number;
}) => {
  const { data, error } = await supabase
    .from("category_sections")
    .insert(fields)
    .select()
    .single();
  return { data: data as CategorySection | null, error };
};

export const renameCategorySection = async (id: number, name: string) => {
  const { error } = await supabase
    .from("category_sections")
    .update({ name })
    .eq("id", id);
  return { error };
};

export const deleteCategorySection = async (id: number) => {
  // Los vínculos que apuntaban a la sección quedan "sin sección"
  // automáticamente (ON DELETE SET NULL).
  const { error } = await supabase
    .from("category_sections")
    .delete()
    .eq("id", id);
  return { error };
};

export const reorderCategorySections = async (orderedIds: number[]) => {
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("category_sections").update({ sort_order: i }).eq("id", id),
    ),
  );
  return { error: results.find((r) => r.error)?.error || null };
};

// Cambia la sección de un vínculo servicio-categoría; el servicio entra AL
// FINAL de la sección de destino.
export const setLinkSection = async (
  linkId: number,
  sectionId: number | null,
  sortOrder: number,
) => {
  const { error } = await supabase
    .from("variable_service_categories")
    .update({ section_id: sectionId, sort_order: sortOrder })
    .eq("id", linkId);
  return { error };
};
