import { supabase } from "../lib/supabase";
import {
  CategorySection,
  VariableServiceCategoryLink,
} from "../types/services.types";

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

// Datos para ordenar platos "como la carta" (ficha de cocina): categorías
// (id por nombre), secciones en su orden y vínculos servicio-categoría.
export const getMenuOrder = async (companyId: number) => {
  const [cats, secs, links] = await Promise.all([
    supabase
      .from("service_categories")
      .select("id, name")
      .eq("company_id", companyId),
    supabase
      .from("category_sections")
      .select("*")
      .eq("company_id", companyId)
      .order("sort_order"),
    supabase
      .from("variable_service_categories")
      .select("id, category_id, variable_service_id, section_id, sort_order")
      .eq("company_id", companyId),
  ]);
  return {
    categories: (cats.data || []) as { id: number; name: string }[],
    sections: (secs.data || []) as CategorySection[],
    links: (links.data || []) as VariableServiceCategoryLink[],
  };
};

// Marca una sección como la FIJA de su categoría (o ninguna, con null).
// Primero despeja la fija actual; la base garantiza que haya a lo más una.
export const setDefaultSection = async (
  categoryId: number,
  sectionId: number | null,
) => {
  const { error: clearErr } = await supabase
    .from("category_sections")
    .update({ is_default: false })
    .eq("category_id", categoryId)
    .eq("is_default", true);
  if (clearErr) return { error: clearErr };
  if (sectionId === null) return { error: null };
  const { error } = await supabase
    .from("category_sections")
    .update({ is_default: true })
    .eq("id", sectionId);
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
