import { supabase } from "../lib/supabase";
import {
  FixedServiceCostItem,
  FurnitureItem,
  ManagementResource,
  RecipeItem,
  RecipeServiceType,
  Supplier,
  Supply,
} from "../types/logistics.types";

// Catálogos del módulo Logística. Acceso directo a Supabase (mismo patrón que
// refunds/event_documents); si luego se decide pasar por la API, este archivo
// es el único punto a cambiar.

// ---------- Proveedores ----------
export const getSuppliers = async (companyId: number): Promise<Supplier[]> => {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    console.error("Error cargando proveedores", error);
    return [];
  }
  return (data || []) as Supplier[];
};

export const createSupplier = async (fields: {
  company_id: number;
  name: string;
  phone?: string | null;
  notes?: string | null;
}) => {
  const { error } = await supabase.from("suppliers").insert(fields);
  return { error };
};

export const updateSupplier = async (
  id: number,
  fields: Partial<Pick<Supplier, "name" | "phone" | "notes" | "is_active">>,
) => {
  const { error } = await supabase
    .from("suppliers")
    .update(fields)
    .eq("id", id);
  return { error };
};

// ---------- Insumos ----------
export const getSupplies = async (companyId: number): Promise<Supply[]> => {
  const { data, error } = await supabase
    .from("supplies")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    console.error("Error cargando insumos", error);
    return [];
  }
  return (data || []) as Supply[];
};

export const createSupply = async (fields: {
  company_id: number;
  name: string;
  unit_family: Supply["unit_family"];
  price: number;
  supplier_id?: number | null;
}) => {
  const { data, error } = await supabase
    .from("supplies")
    .insert(fields)
    .select()
    .single();
  return { data: data as Supply | null, error };
};

export const updateSupply = async (
  id: number,
  fields: Partial<
    Pick<Supply, "name" | "unit_family" | "price" | "supplier_id" | "is_active">
  >,
) => {
  const { error } = await supabase.from("supplies").update(fields).eq("id", id);
  return { error };
};

// ---------- Mobiliario (mini-catálogo; la Fase 5 lo extiende) ----------
export const getFurnitureItems = async (
  companyId: number,
): Promise<FurnitureItem[]> => {
  const { data, error } = await supabase
    .from("furniture_items")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    console.error("Error cargando mobiliario", error);
    return [];
  }
  return (data || []) as FurnitureItem[];
};

export const createFurnitureItem = async (fields: {
  company_id: number;
  name: string;
}) => {
  const { data, error } = await supabase
    .from("furniture_items")
    .insert(fields)
    .select()
    .single();
  return { data: data as FurnitureItem | null, error };
};

export const updateFurnitureItem = async (
  id: number,
  fields: Partial<Pick<FurnitureItem, "name" | "is_active">>,
) => {
  const { error } = await supabase
    .from("furniture_items")
    .update(fields)
    .eq("id", id);
  return { error };
};

// Todas las líneas de ingredientes de la empresa (para calcular el costo por
// persona de cada servicio en la lista de Gestión de Servicios).
export const getAllIngredientRecipeItems = async (
  companyId: number,
): Promise<RecipeItem[]> => {
  const { data, error } = await supabase
    .from("service_recipe_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("item_kind", "insumo");
  if (error) {
    console.error("Error cargando recetas", error);
    return [];
  }
  return (data || []) as RecipeItem[];
};

// Mapa nombre → id de los servicios del catálogo (variables y fijos), para
// resolver los items de cotizaciones antiguas cuyo `codigo` no es el id.
export const getCatalogServiceNameIds = async (
  companyId: number,
): Promise<{
  variable: Record<string, number>;
  fixed: Record<string, number>;
}> => {
  const norm = (s: string) => s.trim().toLowerCase();
  const [v, f] = await Promise.all([
    supabase
      .from("variable_services")
      .select("id, name")
      .eq("company_id", companyId),
    supabase
      .from("fixed_services")
      .select("id, name")
      .eq("company_id", companyId),
  ]);
  const variable: Record<string, number> = {};
  (v.data || []).forEach((s: { id: number; name: string }) => {
    variable[norm(s.name)] = s.id;
  });
  const fixed: Record<string, number> = {};
  (f.data || []).forEach((s: { id: number; name: string }) => {
    fixed[norm(s.name)] = s.id;
  });
  return { variable, fixed };
};

// Costos cacheados de los servicios fijos (componente fijo + por persona),
// para el análisis de rentabilidad del evento.
export const getFixedServiceCostsById = async (
  companyId: number,
): Promise<
  Record<number, { cost_fixed: number | null; cost_per_person: number | null }>
> => {
  const { data, error } = await supabase
    .from("fixed_services")
    .select("id, cost_fixed, cost_per_person")
    .eq("company_id", companyId);
  if (error) {
    console.error("Error cargando costos de servicios fijos", error);
    return {};
  }
  const map: Record<
    number,
    { cost_fixed: number | null; cost_per_person: number | null }
  > = {};
  (data || []).forEach(
    (r: {
      id: number;
      cost_fixed: number | null;
      cost_per_person: number | null;
    }) => {
      map[r.id] = {
        cost_fixed: r.cost_fixed,
        cost_per_person: r.cost_per_person,
      };
    },
  );
  return map;
};

// Todas las líneas de receta de la empresa (insumos + mobiliario), para la
// consolidación logística del evento.
export const getAllRecipeItems = async (
  companyId: number,
): Promise<RecipeItem[]> => {
  const { data, error } = await supabase
    .from("service_recipe_items")
    .select("*")
    .eq("company_id", companyId);
  if (error) {
    console.error("Error cargando recetas", error);
    return [];
  }
  return (data || []) as RecipeItem[];
};

// ---------- Compras multi-evento (Fase 3) ----------
export interface PurchasingEvent {
  id: string; // uuid de la cotización
  quotation_number: number;
  event_date: string | null;
  people_count: number;
  total_amount: number;
  items: unknown;
  provisioned_at: string | null;
  provisioned_cost: number | null;
  client_name: string;
}

// Eventos cerrados (cotizaciones aceptadas), los mismos de Post Venta.
export const getAcceptedEvents = async (
  companyId: number,
): Promise<PurchasingEvent[]> => {
  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, quotation_number, event_date, people_count, total_amount, items, provisioned_at, provisioned_cost, clients(name)",
    )
    .eq("company_id", companyId)
    .eq("quotation_status", "aceptada")
    .order("event_date", { ascending: true });
  if (error) {
    console.error("Error cargando eventos para compras", error);
    return [];
  }
  return (data || []).map((q: Record<string, unknown>) => ({
    ...(q as unknown as PurchasingEvent),
    client_name:
      ((q.clients as { name?: string } | null)?.name as string) || "—",
  }));
};

// Marca los eventos como provisionados (fecha + foto del costo estimado).
// Re-provisionar está permitido: actualiza fecha y costo.
export const markQuotationsProvisioned = async (
  entries: { id: string; cost: number }[],
) => {
  const now = new Date().toISOString();
  const results = await Promise.all(
    entries.map((e) =>
      supabase
        .from("quotations")
        .update({ provisioned_at: now, provisioned_cost: Math.round(e.cost) })
        .eq("id", e.id),
    ),
  );
  return { error: results.find((r) => r.error)?.error || null };
};

// Quita la marca de "evento completo" (desprovisionar / provisión parcial).
export const clearQuotationsProvisioned = async (ids: string[]) => {
  if (!ids.length) return { error: null };
  const { error } = await supabase
    .from("quotations")
    .update({ provisioned_at: null, provisioned_cost: null })
    .in("id", ids);
  return { error };
};

// ---------- Provisión por insumo (evento × insumo) ----------
export interface EventSupplyProvision {
  id: number;
  quotation_id: string;
  supply_id: number;
  qty_base: number;
  cost: number;
  provisioned_at: string;
}

export const getEventSupplyProvisions = async (
  companyId: number,
): Promise<EventSupplyProvision[]> => {
  const { data, error } = await supabase
    .from("event_supply_provisions")
    .select("*")
    .eq("company_id", companyId);
  if (error) {
    console.error("Error cargando provisiones por insumo", error);
    return [];
  }
  return (data || []) as EventSupplyProvision[];
};

// Upsert: re-provisionar un insumo actualiza su foto (cantidad + costo).
export const upsertEventSupplyProvisions = async (
  rows: {
    company_id: number;
    quotation_id: string;
    supply_id: number;
    qty_base: number;
    cost: number;
  }[],
) => {
  if (!rows.length) return { error: null };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("event_supply_provisions")
    .upsert(
      rows.map((r) => ({ ...r, provisioned_at: now })),
      { onConflict: "quotation_id,supply_id" },
    );
  return { error };
};

export const deleteEventSupplyProvisions = async (
  quotationIds: string[],
  supplyIds?: number[], // sin supplyIds = borra todas las del evento
) => {
  if (!quotationIds.length) return { error: null };
  let q = supabase
    .from("event_supply_provisions")
    .delete()
    .in("quotation_id", quotationIds);
  if (supplyIds && supplyIds.length) q = q.in("supply_id", supplyIds);
  const { error } = await q;
  return { error };
};

// Estado de provisión de una cotización (para el badge en Gestión).
export const getQuotationProvisioning = async (
  quotationId: string,
): Promise<{ provisioned_at: string | null }> => {
  const { data } = await supabase
    .from("quotations")
    .select("provisioned_at")
    .eq("id", quotationId)
    .single();
  return { provisioned_at: (data?.provisioned_at as string | null) || null };
};

// ---------- Recetas por servicio ----------
export const getRecipeItems = async (
  companyId: number,
  serviceType: RecipeServiceType,
  serviceId: number,
): Promise<RecipeItem[]> => {
  const { data, error } = await supabase
    .from("service_recipe_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("service_type", serviceType)
    .eq("service_id", serviceId)
    .order("created_at");
  if (error) {
    console.error("Error cargando receta", error);
    return [];
  }
  return (data || []) as RecipeItem[];
};

export const addRecipeItem = async (fields: {
  company_id: number;
  service_type: RecipeServiceType;
  service_id: number;
  item_kind: RecipeItem["item_kind"];
  supply_id?: number | null;
  furniture_id?: number | null;
  qty_per_person: number;
  unit: RecipeItem["unit"];
}) => {
  const { error } = await supabase.from("service_recipe_items").insert(fields);
  return { error };
};

export const updateRecipeItem = async (
  id: number,
  fields: Partial<Pick<RecipeItem, "qty_per_person" | "unit">>,
) => {
  const { error } = await supabase
    .from("service_recipe_items")
    .update(fields)
    .eq("id", id);
  return { error };
};

export const deleteRecipeItem = async (id: number) => {
  const { error } = await supabase
    .from("service_recipe_items")
    .delete()
    .eq("id", id);
  return { error };
};

// ---------- Costo de servicios fijos (tercerización / por persona) ----------
export const updateFixedServiceCosts = async (
  id: number,
  fields: { cost_fixed: number; cost_per_person: number },
) => {
  const { error } = await supabase
    .from("fixed_services")
    .update(fields)
    .eq("id", id);
  return { error };
};

// ---------- Recursos de gestión ----------
export const getManagementResources = async (
  companyId: number,
): Promise<ManagementResource[]> => {
  const { data, error } = await supabase
    .from("management_resources")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    console.error("Error cargando recursos", error);
    return [];
  }
  return (data || []) as ManagementResource[];
};

export const createManagementResource = async (fields: {
  company_id: number;
  name: string;
  type: ManagementResource["type"];
  supplier_id?: number | null;
  list_price_fixed?: number | null;
  list_price_per_person?: number | null;
}) => {
  const { data, error } = await supabase
    .from("management_resources")
    .insert(fields)
    .select()
    .single();
  return { data: data as ManagementResource | null, error };
};

export const updateManagementResource = async (
  id: number,
  fields: Partial<
    Pick<
      ManagementResource,
      | "name"
      | "type"
      | "last_price"
      | "is_active"
      | "supplier_id"
      | "list_price_fixed"
      | "list_price_per_person"
    >
  >,
) => {
  const { error } = await supabase
    .from("management_resources")
    .update(fields)
    .eq("id", id);
  return { error };
};

// ---------- Líneas de costo de un servicio fijo (referencias a recursos) ----
export const getFixedServiceCostItems = async (
  companyId: number,
  fixedServiceId: number,
): Promise<FixedServiceCostItem[]> => {
  const { data, error } = await supabase
    .from("fixed_service_cost_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("fixed_service_id", fixedServiceId)
    .order("created_at");
  if (error) {
    console.error("Error cargando costos del servicio", error);
    return [];
  }
  return (data || []) as FixedServiceCostItem[];
};

export const addFixedServiceCostItem = async (fields: {
  company_id: number;
  fixed_service_id: number;
  resource_id: number;
  quantity: number;
}) => {
  const { error } = await supabase
    .from("fixed_service_cost_items")
    .insert(fields);
  return { error };
};

export const updateFixedServiceCostItem = async (
  id: number,
  fields: Partial<Pick<FixedServiceCostItem, "quantity">>,
) => {
  const { error } = await supabase
    .from("fixed_service_cost_items")
    .update(fields)
    .eq("id", id);
  return { error };
};

export const deleteFixedServiceCostItem = async (id: number) => {
  const { error } = await supabase
    .from("fixed_service_cost_items")
    .delete()
    .eq("id", id);
  return { error };
};
