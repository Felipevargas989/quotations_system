import { API_ROUTES } from "../constants/api.routes";
import {
  CategorySection,
  VariableServiceCategoryLink,
} from "../types/services.types";
import { apiRequest } from "./api";

// Secciones de categoría (Entradas / Fondos / Postres...).
// MUDANZA #7 (28-07): por el backend (/sections). Lecturas vendedor+;
// edición administrador; empresa de la sesión.

export const getCategorySections = async (
  _companyId: number,
): Promise<CategorySection[]> => {
  try {
    const data = await apiRequest(API_ROUTES.SECTIONS, "GET");
    return (data || []) as CategorySection[];
  } catch {
    return [];
  }
};

export const createCategorySection = async (fields: {
  company_id: number;
  category_id: number;
  name: string;
  sort_order: number;
}) => {
  try {
    const { company_id: _omitido, ...datos } = fields;
    const data = await apiRequest(API_ROUTES.SECTIONS, "POST", datos);
    return { data: data as CategorySection | null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const renameCategorySection = async (id: number, name: string) => {
  try {
    await apiRequest(`${API_ROUTES.SECTIONS}/${id}`, "PATCH", { name });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteCategorySection = async (id: number) => {
  // Los vínculos que apuntaban a la sección quedan "sin sección"
  // automáticamente (ON DELETE SET NULL).
  try {
    await apiRequest(`${API_ROUTES.SECTIONS}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Datos para ordenar platos "como la carta" (ficha de cocina).
export const getMenuOrder = async (_companyId: number) => {
  try {
    const data = await apiRequest(API_ROUTES.SECTIONS_MENU_ORDER, "GET");
    return {
      categories: (data?.categories || []) as { id: number; name: string }[],
      sections: (data?.sections || []) as CategorySection[],
      links: (data?.links || []) as VariableServiceCategoryLink[],
    };
  } catch {
    return { categories: [], sections: [], links: [] };
  }
};

// Marca una sección como la FIJA de su categoría (o ninguna, con null).
export const setDefaultSection = async (
  categoryId: number,
  sectionId: number | null,
) => {
  try {
    await apiRequest(`${API_ROUTES.SECTIONS}/default`, "PATCH", {
      category_id: categoryId,
      section_id: sectionId,
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const reorderCategorySections = async (orderedIds: number[]) => {
  try {
    await apiRequest(`${API_ROUTES.SECTIONS}/reorder`, "PATCH", { orderedIds });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Cambia la sección de un vínculo servicio-categoría; el servicio entra AL
// FINAL de la sección de destino.
export const setLinkSection = async (
  linkId: number,
  sectionId: number | null,
  sortOrder: number,
) => {
  try {
    await apiRequest(`${API_ROUTES.SECTIONS}/link/${linkId}`, "PATCH", {
      section_id: sectionId,
      sort_order: sortOrder,
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};
