import { supabase } from "../lib/supabase";
import { canonicalServiceName } from "../utils/searchMatch";
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
  contact_name?: string | null;
  phone?: string | null;
  notes?: string | null;
}) => {
  const { error } = await supabase.from("suppliers").insert(fields);
  return { error };
};

export const updateSupplier = async (
  id: number,
  fields: Partial<
    Pick<Supplier, "name" | "contact_name" | "phone" | "notes" | "is_active">
  >,
) => {
  const { error } = await supabase
    .from("suppliers")
    .update(fields)
    .eq("id", id);
  return { error };
};

// Cuántos insumos y recursos apuntan a cada proveedor. Con cualquier
// referencia el proveedor no se puede eliminar (las compras se generan a
// su nombre); sin ninguna, sí.
export const getSuppliersUsage = async (
  companyId: number,
): Promise<Record<number, { supplies: number; resources: number }>> => {
  const usage: Record<number, { supplies: number; resources: number }> = {};
  const [sup, res] = await Promise.all([
    supabase
      .from("supplies")
      .select("supplier_id")
      .eq("company_id", companyId)
      .not("supplier_id", "is", null),
    supabase
      .from("management_resources")
      .select("supplier_id")
      .eq("company_id", companyId)
      .not("supplier_id", "is", null),
  ]);
  (sup.data || []).forEach((r) => {
    const id = r.supplier_id as number;
    usage[id] = usage[id] || { supplies: 0, resources: 0 };
    usage[id].supplies += 1;
  });
  (res.data || []).forEach((r) => {
    const id = r.supplier_id as number;
    usage[id] = usage[id] || { supplies: 0, resources: 0 };
    usage[id].resources += 1;
  });
  return usage;
};

export const deleteSupplier = async (id: number) => {
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  return { error };
};

// Referencias de cada recurso de gestión (costos de servicios fijos +
// recursos asignados a eventos). Con cualquiera, no se elimina: la
// eliminación arrastraría esa historia en cascada.
export const getResourcesUsage = async (
  companyId: number,
): Promise<Record<number, { costLines: number; events: number }>> => {
  const usage: Record<number, { costLines: number; events: number }> = {};
  const [cost, ev] = await Promise.all([
    supabase
      .from("fixed_service_cost_items")
      .select("resource_id")
      .eq("company_id", companyId),
    supabase
      .from("event_resources")
      .select("resource_id")
      .eq("company_id", companyId),
  ]);
  (cost.data || []).forEach((r) => {
    const id = r.resource_id as number;
    usage[id] = usage[id] || { costLines: 0, events: 0 };
    usage[id].costLines += 1;
  });
  (ev.data || []).forEach((r) => {
    const id = r.resource_id as number;
    usage[id] = usage[id] || { costLines: 0, events: 0 };
    usage[id].events += 1;
  });
  return usage;
};

export const deleteManagementResource = async (id: number) => {
  const { error } = await supabase
    .from("management_resources")
    .delete()
    .eq("id", id);
  return { error };
};

// Recetas que usan cada item de mobiliario. Con cualquiera, no se
// elimina (la eliminación borraría esas líneas de receta en cascada).
export const getFurnitureUsage = async (
  companyId: number,
): Promise<Record<number, { recipes: number }>> => {
  const usage: Record<number, { recipes: number }> = {};
  const { data } = await supabase
    .from("service_recipe_items")
    .select("furniture_id")
    .eq("company_id", companyId)
    .eq("item_kind", "mobiliario")
    .not("furniture_id", "is", null);
  (data || []).forEach((r) => {
    const id = r.furniture_id as number;
    usage[id] = usage[id] || { recipes: 0 };
    usage[id].recipes += 1;
  });
  return usage;
};

export const deleteFurnitureItem = async (id: number) => {
  const { error } = await supabase
    .from("furniture_items")
    .delete()
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
  waste_pct?: number;
  package_name?: string | null;
  package_qty?: number | null;
  package_price?: number | null;
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
    Pick<
      Supply,
      | "name"
      | "unit_family"
      | "price"
      | "supplier_id"
      | "is_active"
      | "waste_pct"
      | "package_name"
      | "package_qty"
      | "package_price"
    >
  >,
) => {
  const { error } = await supabase.from("supplies").update(fields).eq("id", id);
  return { error };
};

// Uso de cada insumo: en cuántos servicios aparece su receta y si tiene
// compras registradas (aprovisionamientos). Eliminar solo se permite si está
// totalmente libre; si está en uso, la opción es desactivarlo — borrar en
// cascada haría desaparecer líneas de receta e historial de compras.
export const getSupplyUsage = async (
  supplyIds: number[],
): Promise<Record<number, { recipes: number; provisions: number }>> => {
  const usage: Record<number, { recipes: number; provisions: number }> = {};
  if (!supplyIds.length) return usage;
  supplyIds.forEach((id) => {
    usage[id] = { recipes: 0, provisions: 0 };
  });
  const [rec, prov] = await Promise.all([
    supabase
      .from("service_recipe_items")
      .select("supply_id, service_id")
      .in("supply_id", supplyIds),
    supabase
      .from("event_supply_provisions")
      .select("supply_id")
      .in("supply_id", supplyIds),
  ]);
  const seen = new Set<string>();
  (rec.data || []).forEach((r) => {
    const sid = r.supply_id as number;
    const key = `${sid}-${r.service_id}`;
    if (usage[sid] && !seen.has(key)) {
      seen.add(key);
      usage[sid].recipes += 1;
    }
  });
  (prov.data || []).forEach((r) => {
    const sid = r.supply_id as number;
    if (usage[sid]) usage[sid].provisions += 1;
  });
  return usage;
};

export const deleteSupply = async (id: number) => {
  const { error } = await supabase.from("supplies").delete().eq("id", id);
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
  category?: FurnitureItem["category"];
  stock?: number;
  photo_url?: string | null;
  preassembled?: boolean;
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
  fields: Partial<
    Pick<
      FurnitureItem,
      "name" | "is_active" | "category" | "stock" | "photo_url" | "preassembled"
    >
  >,
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
  // Claves canónicas (sin tildes, sin prefijo "02 - ", espacios
  // flexibles): las fotos de items de cotizaciones antiguas encuentran
  // su servicio aunque el catálogo haya sido renombrado.
  const norm = canonicalServiceName;
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
  // Último día del evento (null = un solo día).
  event_end_date: string | null;
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
      "id, quotation_number, event_date, event_end_date, people_count, total_amount, items, provisioned_at, provisioned_cost, clients(name)",
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

// Eventos concretados (aceptada + realizada) con evento desde una fecha:
// alimenta el cálculo de MÁRGENES del Dashboard (Fase 4, 23-07). Mismos
// campos que compras; el costo congelado viaja en provisioned_cost.
export const getWonEventsSince = async (
  companyId: number,
  fromISO: string,
): Promise<PurchasingEvent[]> => {
  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, quotation_number, event_date, event_end_date, people_count, total_amount, items, provisioned_at, provisioned_cost, clients(name)",
    )
    .eq("company_id", companyId)
    .in("quotation_status", ["aceptada", "realizada"])
    .gte("event_date", fromISO)
    .order("event_date", { ascending: true });
  if (error) {
    console.error("Error cargando eventos para márgenes", error);
    return [];
  }
  return (data || []).map((q: Record<string, unknown>) => ({
    ...(q as unknown as PurchasingEvent),
    client_name:
      ((q.clients as { name?: string } | null)?.name as string) || "—",
  }));
};

// Marca los eventos como provisionados: fecha + foto del costo estimado,
// personas y servicios al momento (para advertir cambios posteriores).
// Re-provisionar está permitido: actualiza la foto completa.
export const markQuotationsProvisioned = async (
  entries: {
    id: string;
    cost: number;
    people: number;
    services: { nombre: string; quantity: number }[];
  }[],
) => {
  const now = new Date().toISOString();
  const results = await Promise.all(
    entries.map((e) =>
      supabase
        .from("quotations")
        .update({
          provisioned_at: now,
          provisioned_cost: Math.round(e.cost),
          provisioned_people: e.people,
          provisioned_services: e.services,
        })
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
    .update({
      provisioned_at: null,
      provisioned_cost: null,
      provisioned_people: null,
      provisioned_services: null,
    })
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
  // Foto del proveedor al momento de comprar (migración 30): la
  // estadística por proveedor no se reescribe si el insumo cambia de
  // proveedor, se renombra o se elimina después.
  supplier_id: number | null;
  supplier_name: string | null;
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
    supplier_id: number | null;
    supplier_name: string | null;
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

// Estado de provisión de una cotización (badge + advertencias en Gestión).
export interface QuotationProvisioning {
  provisioned_at: string | null;
  provisioned_cost: number | null;
  provisioned_people: number | null;
  provisioned_services: { nombre: string; quantity: number }[] | null;
}

export const getQuotationProvisioning = async (
  quotationId: string,
): Promise<QuotationProvisioning> => {
  const { data } = await supabase
    .from("quotations")
    .select(
      "provisioned_at, provisioned_cost, provisioned_people, provisioned_services",
    )
    .eq("id", quotationId)
    .single();
  return {
    provisioned_at: (data?.provisioned_at as string | null) || null,
    provisioned_cost: (data?.provisioned_cost as number | null) ?? null,
    provisioned_people: (data?.provisioned_people as number | null) ?? null,
    provisioned_services:
      (data?.provisioned_services as
        | { nombre: string; quantity: number }[]
        | null) || null,
  };
};

// ---------- Recursos asignados a un evento (Fase 4) ----------
export interface EventResource {
  id: number;
  quotation_id: string;
  resource_id: number;
  quantity: number;
  price_fixed: number;
  price_per_person: number;
  // servicio fijo del que se importó la línea (NULL = agregado a mano)
  origin_fixed_service_id: number | null;
}

export const getEventResources = async (
  companyId: number,
  quotationId: string,
): Promise<EventResource[]> => {
  const { data, error } = await supabase
    .from("event_resources")
    .select("*")
    .eq("company_id", companyId)
    .eq("quotation_id", quotationId)
    .order("created_at");
  if (error) {
    console.error("Error cargando recursos del evento", error);
    return [];
  }
  return (data || []) as EventResource[];
};

export const addEventResource = async (fields: {
  company_id: number;
  quotation_id: string;
  resource_id: number;
  quantity: number;
  price_fixed: number;
  price_per_person: number;
  origin_fixed_service_id?: number | null;
}) => {
  const { error } = await supabase.from("event_resources").insert(fields);
  return { error };
};

export const addEventResources = async (
  rows: {
    company_id: number;
    quotation_id: string;
    resource_id: number;
    quantity: number;
    price_fixed: number;
    price_per_person: number;
    origin_fixed_service_id?: number | null;
  }[],
) => {
  if (!rows.length) return { error: null };
  const { error } = await supabase.from("event_resources").insert(rows);
  return { error };
};

// Todas las líneas de costo de servicios fijos de la empresa (para importar
// los recursos de los fijos de un evento).
export const getAllFixedServiceCostItems = async (
  companyId: number,
): Promise<FixedServiceCostItem[]> => {
  const { data, error } = await supabase
    .from("fixed_service_cost_items")
    .select("*")
    .eq("company_id", companyId);
  if (error) {
    console.error("Error cargando costos de servicios fijos", error);
    return [];
  }
  return (data || []) as FixedServiceCostItem[];
};

export const updateEventResource = async (
  id: number,
  fields: Partial<
    Pick<EventResource, "quantity" | "price_fixed" | "price_per_person">
  >,
) => {
  const { error } = await supabase
    .from("event_resources")
    .update(fields)
    .eq("id", id);
  return { error };
};

export const deleteEventResource = async (id: number) => {
  const { error } = await supabase
    .from("event_resources")
    .delete()
    .eq("id", id);
  return { error };
};

// ---------- Ficha de cocina: horarios y notas del evento ----------
export const getEventServiceTimes = async (
  companyId: number,
  quotationId: string,
): Promise<Record<string, string>> => {
  const { data, error } = await supabase
    .from("event_service_times")
    .select("service_name, start_time")
    .eq("company_id", companyId)
    .eq("quotation_id", quotationId);
  if (error) {
    console.error("Error cargando horarios", error);
    return {};
  }
  const map: Record<string, string> = {};
  (data || []).forEach(
    (r: { service_name: string; start_time: string }) => {
      map[r.service_name] = r.start_time;
    },
  );
  return map;
};

export const setEventServiceTime = async (
  companyId: number,
  quotationId: string,
  serviceName: string,
  startTime: string,
) => {
  const { error } = await supabase.from("event_service_times").upsert(
    {
      company_id: companyId,
      quotation_id: quotationId,
      service_name: serviceName,
      start_time: startTime,
    },
    { onConflict: "quotation_id,service_name" },
  );
  return { error };
};

export interface KitchenNote {
  id: number;
  note: string;
  // Día del evento al que pertenece la nota (null = nota antigua → día 1).
  day: number | null;
}

export const getEventKitchenNotes = async (
  companyId: number,
  quotationId: string,
): Promise<KitchenNote[]> => {
  const { data, error } = await supabase
    .from("event_kitchen_notes")
    .select("id, note, day")
    .eq("company_id", companyId)
    .eq("quotation_id", quotationId)
    .order("created_at");
  if (error) {
    console.error("Error cargando notas de cocina", error);
    return [];
  }
  return (data || []) as KitchenNote[];
};

export const addEventKitchenNote = async (
  companyId: number,
  quotationId: string,
  note: string,
  day?: number,
) => {
  const { error } = await supabase.from("event_kitchen_notes").insert({
    company_id: companyId,
    quotation_id: quotationId,
    note,
    day: day ?? null,
  });
  return { error };
};

// ---------- Fichas impresas por día ----------
// La primera impresión de la ficha de un día queda registrada: el
// desplegable del día se pinta verde suave. Día pasado sin registro =
// operó sin ficha.
export const getEventDayPrints = async (
  companyId: number,
  quotationId: string,
): Promise<Record<number, string>> => {
  const { data, error } = await supabase
    .from("event_day_prints")
    .select("day, printed_at")
    .eq("company_id", companyId)
    .eq("quotation_id", quotationId);
  if (error) {
    console.error("Error cargando fichas impresas", error);
    return {};
  }
  const map: Record<number, string> = {};
  (data || []).forEach((r: { day: number; printed_at: string }) => {
    map[r.day] = r.printed_at;
  });
  return map;
};

export const markEventDaysPrinted = async (
  companyId: number,
  quotationId: string,
  days: number[],
) => {
  if (!days.length) return { error: null };
  const { error } = await supabase.from("event_day_prints").upsert(
    days.map((day) => ({
      company_id: companyId,
      quotation_id: quotationId,
      day,
      printed_at: new Date().toISOString(),
    })),
    { onConflict: "quotation_id,day" },
  );
  return { error };
};

export const deleteEventKitchenNote = async (id: number) => {
  const { error } = await supabase
    .from("event_kitchen_notes")
    .delete()
    .eq("id", id);
  return { error };
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
