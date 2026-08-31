// 28-07-2026: este archivo ya NO importa supabase — logística COMPLETA
// pasa por el backend (/logistics/*). Fue el más grande de los accesos
// directos (1.012 líneas); hoy es solo un traductor de llamadas.
import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
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
// MUDANZA #2 de "una sola puerta" (28-07): esta sección ya NO va
// directo a Supabase — pasa por el backend (/logistics/suppliers), que
// exige el cargo, acota por empresa desde la sesión y aplica la regla
// "con referencias no se elimina" en el servidor. Las firmas quedaron
// idénticas: las 8 pantallas que llaman esto no notan la diferencia.
// (companyId se mantiene en la firma por compatibilidad; el backend usa
// SIEMPRE la empresa de la sesión.)
export const getSuppliers = async (
  _companyId: number,
): Promise<Supplier[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_SUPPLIERS, "GET");
    return (data || []) as Supplier[];
  } catch {
    return [];
  }
};

export const createSupplier = async (fields: {
  company_id: number;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  notes?: string | null;
}) => {
  try {
    // company_id no viaja: el backend usa el de la sesión.
    const { company_id: _omitido, ...datos } = fields;
    await apiRequest(API_ROUTES.LOGISTICS_SUPPLIERS, "POST", datos);
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const updateSupplier = async (
  id: number,
  fields: Partial<
    Pick<Supplier, "name" | "contact_name" | "phone" | "notes" | "is_active">
  >,
) => {
  try {
    await apiRequest(
      `${API_ROUTES.LOGISTICS_SUPPLIERS}/${id}`,
      "PATCH",
      fields,
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Cuántos insumos y recursos apuntan a cada proveedor. Con cualquier
// referencia el proveedor no se puede eliminar (las compras se generan a
// su nombre); sin ninguna, sí. El conteo lo hace el backend.
export const getSuppliersUsage = async (
  _companyId: number,
): Promise<Record<number, { supplies: number; resources: number }>> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_SUPPLIERS_USAGE, "GET");
    return (data || {}) as Record<
      number,
      { supplies: number; resources: number }
    >;
  } catch {
    return {};
  }
};

export const deleteSupplier = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_SUPPLIERS}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Referencias de cada recurso de gestión (costos de servicios fijos +
// recursos asignados a eventos). Con cualquiera, no se elimina: la
// eliminación arrastraría esa historia en cascada.
// MUDANZA #5 (28-07): recursos por el backend (/logistics/resources).
export const getResourcesUsage = async (
  _companyId: number,
): Promise<Record<number, { costLines: number; events: number }>> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_RESOURCES_USAGE, "GET");
    return (data || {}) as Record<
      number,
      { costLines: number; events: number }
    >;
  } catch {
    return {};
  }
};

export const deleteManagementResource = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_RESOURCES}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// MUDANZA #4 (28-07): mobiliario por el backend (/logistics/furniture).
// Recetas que usan cada item de mobiliario. Con cualquiera, no se
// elimina (la regla ahora también vive en el servidor).
export const getFurnitureUsage = async (
  _companyId: number,
): Promise<Record<number, { recipes: number }>> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_FURNITURE_USAGE, "GET");
    return (data || {}) as Record<number, { recipes: number }>;
  } catch {
    return {};
  }
};

export const deleteFurnitureItem = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_FURNITURE}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Insumos ----------
// MUDANZA #3 (28-07): insumos por el backend (/logistics/supplies).
// Mismas firmas; company_id de la sesión; regla "en uso no se elimina"
// ahora en el servidor.
export const getSupplies = async (_companyId: number): Promise<Supply[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_SUPPLIES, "GET");
    return (data || []) as Supply[];
  } catch {
    return [];
  }
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
  try {
    const { company_id: _omitido, ...datos } = fields;
    const data = await apiRequest(API_ROUTES.LOGISTICS_SUPPLIES, "POST", datos);
    return { data: data as Supply | null, error: null };
  } catch (error) {
    return { data: null, error };
  }
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
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_SUPPLIES}/${id}`, "PATCH", fields);
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Uso de cada insumo: en cuántos servicios aparece su receta y si tiene
// compras registradas (aprovisionamientos). Eliminar solo se permite si está
// totalmente libre; si está en uso, la opción es desactivarlo — borrar en
// cascada haría desaparecer líneas de receta e historial de compras.
export const getSupplyUsage = async (
  supplyIds: number[],
): Promise<Record<number, { recipes: number; provisions: number }>> => {
  if (!supplyIds.length) return {};
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_SUPPLIES_USAGE,
      "GET",
      undefined,
      { ids: supplyIds.join(",") },
    );
    return (data || {}) as Record<
      number,
      { recipes: number; provisions: number }
    >;
  } catch {
    return {};
  }
};

export const deleteSupply = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_SUPPLIES}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Mobiliario (mini-catálogo; la Fase 5 lo extiende) ----------
export const getFurnitureItems = async (
  _companyId: number,
): Promise<FurnitureItem[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_FURNITURE, "GET");
    return (data || []) as FurnitureItem[];
  } catch {
    return [];
  }
};

export const createFurnitureItem = async (fields: {
  company_id: number;
  name: string;
  category?: FurnitureItem["category"];
  stock?: number;
  photo_url?: string | null;
  preassembled?: boolean;
}) => {
  try {
    const { company_id: _omitido, ...datos } = fields;
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_FURNITURE,
      "POST",
      datos,
    );
    return { data: data as FurnitureItem | null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const updateFurnitureItem = async (
  id: number,
  fields: Partial<
    Pick<
      FurnitureItem,
      | "name"
      | "is_active"
      | "category"
      | "stock"
      | "photo_url"
      | "preassembled"
      | "unit_cost"
    >
  >,
) => {
  try {
    await apiRequest(
      `${API_ROUTES.LOGISTICS_FURNITURE}/${id}`,
      "PATCH",
      fields,
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// MUDANZA #6 (28-07): de aquí hacia abajo, TODO por el backend.
// Todas las líneas de ingredientes de la empresa (misma lectura general
// de recetas, filtrada acá por insumo — resultado idéntico).
export const getAllIngredientRecipeItems = async (
  companyId: number,
): Promise<RecipeItem[]> => {
  const todas = await getAllRecipeItems(companyId);
  return todas.filter((r) => r.item_kind === "insumo");
};

// Mapa nombre → id de los servicios del catálogo (variables y fijos), para
// resolver los items de cotizaciones antiguas cuyo `codigo` no es el id.
export const getCatalogServiceNameIds = async (
  companyId: number,
): Promise<{
  variable: Record<string, number>;
  fixed: Record<string, number>;
  // Migración 57: servicios marcados "sin costo en Eventia" — las
  // advertencias de Gestión los excluyen (no son pendientes).
  sinCostoVariable: string[]; // nombres canónicos
  sinCostoFijoIds: number[];
}> => {
  // Claves canónicas (sin tildes, sin prefijo "02 - ", espacios
  // flexibles): las fotos de items de cotizaciones antiguas encuentran
  // su servicio aunque el catálogo haya sido renombrado.
  const norm = canonicalServiceName;
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_CATALOG_NAMES, "GET");
    const variable: Record<string, number> = {};
    const sinCostoVariable: string[] = [];
    (data?.variable || []).forEach(
      (s: { id: number; name: string; no_cost?: boolean }) => {
        variable[norm(s.name)] = s.id;
        if (s.no_cost) sinCostoVariable.push(norm(s.name));
      },
    );
    const fixed: Record<string, number> = {};
    const sinCostoFijoIds: number[] = [];
    (data?.fixed || []).forEach(
      (s: { id: number; name: string; no_cost?: boolean }) => {
        fixed[norm(s.name)] = s.id;
        if (s.no_cost) sinCostoFijoIds.push(s.id);
      },
    );
    return { variable, fixed, sinCostoVariable, sinCostoFijoIds };
  } catch {
    return {
      variable: {},
      fixed: {},
      sinCostoVariable: [],
      sinCostoFijoIds: [],
    };
  }
};

// Costos cacheados de los servicios fijos (componente fijo + por persona),
// para el análisis de rentabilidad del evento.
export const getFixedServiceCostsById = async (
  companyId: number,
): Promise<
  Record<number, { cost_fixed: number | null; cost_per_person: number | null }>
> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_CATALOG_FIXED_COSTS,
      "GET",
    );
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
  } catch {
    return {};
  }
};

// Todas las líneas de receta de la empresa (insumos + mobiliario), para la
// consolidación logística del evento.
export const getAllRecipeItems = async (
  _companyId: number,
): Promise<RecipeItem[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_RECIPES_ALL, "GET");
    return (data || []) as RecipeItem[];
  } catch {
    return [];
  }
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
  /** Solo viene en los eventos concretados: distingue lo ya hecho de lo
   *  agendado. El flujo de caja lo usa para saber si la plata YA salió. */
  quotation_status?: string;
  client_name: string;
}

// Eventos cerrados (cotizaciones aceptadas), los mismos de Post Venta.
export const getAcceptedEvents = async (
  _companyId: number,
): Promise<PurchasingEvent[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_ACCEPTED_EVENTS, "GET");
    return (data || []).map((q: Record<string, unknown>) => ({
      ...(q as unknown as PurchasingEvent),
      client_name:
        ((q.clients as { name?: string } | null)?.name as string) || "—",
    }));
  } catch {
    return [];
  }
};

// Eventos concretados (aceptada + realizada) con evento desde una fecha:
// alimenta el cálculo de MÁRGENES del Dashboard (Fase 4, 23-07). Mismos
// campos que compras; el costo congelado viaja en provisioned_cost.
export const getWonEventsSince = async (
  _companyId: number,
  fromISO: string,
): Promise<PurchasingEvent[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_WON_EVENTS,
      "GET",
      undefined,
      { from: fromISO },
    );
    return (data || []).map((q: Record<string, unknown>) => ({
      ...(q as unknown as PurchasingEvent),
      client_name:
        ((q.clients as { name?: string } | null)?.name as string) || "—",
    }));
  } catch {
    return [];
  }
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
  try {
    await apiRequest(API_ROUTES.LOGISTICS_MARK_PROVISIONED, "POST", {
      entries,
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Quita la marca de "evento completo" (desprovisionar / provisión parcial).
export const clearQuotationsProvisioned = async (ids: string[]) => {
  if (!ids.length) return { error: null };
  try {
    await apiRequest(API_ROUTES.LOGISTICS_CLEAR_PROVISIONED, "POST", { ids });
    return { error: null };
  } catch (error) {
    return { error };
  }
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
  _companyId: number,
): Promise<EventSupplyProvision[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_SUPPLY_PROVISIONS, "GET");
    return (data || []) as EventSupplyProvision[];
  } catch {
    return [];
  }
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
  try {
    await apiRequest(API_ROUTES.LOGISTICS_SUPPLY_PROVISIONS, "POST", {
      // company_id no viaja: el backend usa el de la sesión.
      rows: rows.map(({ company_id: _omitido, ...r }) => r),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteEventSupplyProvisions = async (
  quotationIds: string[],
  supplyIds?: number[], // sin supplyIds = borra todas las del evento
) => {
  if (!quotationIds.length) return { error: null };
  try {
    await apiRequest(API_ROUTES.LOGISTICS_SUPPLY_PROVISIONS_DELETE, "POST", {
      quotationIds,
      ...(supplyIds && supplyIds.length ? { supplyIds } : {}),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
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
  let data: Record<string, unknown> | null = null;
  try {
    data = await apiRequest(
      `${API_ROUTES.LOGISTICS_PROVISIONING}/${quotationId}`,
      "GET",
    );
  } catch {
    data = null;
  }
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
  // Día del evento al que corresponde esta cantidad. NULL = sin repartir.
  // La cantidad SIEMPRE fue el total del evento; repartirla no cambia el
  // costo — solo dice cuándo va cada uno ("se necesitan diez personas,
  // pero no diez personas el mismo día", Felipe).
  day: string | null;
}

export const getEventResources = async (
  _companyId: number,
  quotationId: string,
): Promise<EventResource[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_EVENT_RESOURCES,
      "GET",
      undefined,
      { quotationId },
    );
    return (data || []) as EventResource[];
  } catch {
    return [];
  }
};

// Todos los recursos asignados a eventos de la empresa (análisis de
// proveedores del Dashboard, 23-07): el filtro por período se hace en
// el front contra el set de eventos concretados.
export const getAllEventResources = async (
  _companyId: number,
): Promise<EventResource[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_EVENT_RESOURCES, "GET");
    return (data || []) as EventResource[];
  } catch {
    return [];
  }
};

export const addEventResource = async (fields: {
  company_id: number;
  quotation_id: string;
  resource_id: number;
  quantity: number;
  price_fixed: number;
  price_per_person: number;
  origin_fixed_service_id?: number | null;
  day?: string | null;
}) => {
  try {
    const { company_id: _omitido, ...r } = fields;
    await apiRequest(API_ROUTES.LOGISTICS_EVENT_RESOURCES, "POST", {
      rows: [r],
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
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
    day?: string | null;
  }[],
) => {
  if (!rows.length) return { error: null };
  try {
    await apiRequest(API_ROUTES.LOGISTICS_EVENT_RESOURCES, "POST", {
      rows: rows.map(({ company_id: _omitido, ...r }) => r),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// Todas las líneas de costo de servicios fijos de la empresa (para importar
// los recursos de los fijos de un evento).
export const getAllFixedServiceCostItems = async (
  _companyId: number,
): Promise<FixedServiceCostItem[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_FIXED_COST_ITEMS, "GET");
    return (data || []) as FixedServiceCostItem[];
  } catch {
    return [];
  }
};

export const updateEventResource = async (
  id: number,
  fields: Partial<
    Pick<EventResource, "quantity" | "price_fixed" | "price_per_person" | "day">
  >,
) => {
  try {
    await apiRequest(
      `${API_ROUTES.LOGISTICS_EVENT_RESOURCES}/${id}`,
      "PATCH",
      fields,
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteEventResource = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_EVENT_RESOURCES}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Ficha de cocina: horarios y notas del evento ----------
export const getEventServiceTimes = async (
  _companyId: number,
  quotationId: string,
): Promise<Record<string, string>> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_KITCHEN_TIMES,
      "GET",
      undefined,
      { quotationId },
    );
    const map: Record<string, string> = {};
    (data || []).forEach((r: { service_name: string; start_time: string }) => {
      map[r.service_name] = r.start_time;
    });
    return map;
  } catch {
    return {};
  }
};

export const setEventServiceTime = async (
  _companyId: number,
  quotationId: string,
  serviceName: string,
  startTime: string,
) => {
  try {
    await apiRequest(API_ROUTES.LOGISTICS_KITCHEN_TIMES, "POST", {
      quotation_id: quotationId,
      service_name: serviceName,
      start_time: startTime,
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export interface KitchenNote {
  id: number;
  note: string;
  // Día del evento al que pertenece la nota (null = nota antigua → día 1).
  day: number | null;
}

export const getEventKitchenNotes = async (
  _companyId: number,
  quotationId: string,
): Promise<KitchenNote[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_KITCHEN_NOTES,
      "GET",
      undefined,
      { quotationId },
    );
    return (data || []) as KitchenNote[];
  } catch {
    return [];
  }
};

export const addEventKitchenNote = async (
  _companyId: number,
  quotationId: string,
  note: string,
  day?: number,
) => {
  try {
    await apiRequest(API_ROUTES.LOGISTICS_KITCHEN_NOTES, "POST", {
      quotation_id: quotationId,
      note,
      ...(day !== undefined ? { day } : {}),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Fichas impresas por día ----------
// La primera impresión de la ficha de un día queda registrada: el
// desplegable del día se pinta verde suave. Día pasado sin registro =
// operó sin ficha.
export const getEventDayPrints = async (
  _companyId: number,
  quotationId: string,
): Promise<Record<number, string>> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_KITCHEN_DAY_PRINTS,
      "GET",
      undefined,
      { quotationId },
    );
    const map: Record<number, string> = {};
    (data || []).forEach((r: { day: number; printed_at: string }) => {
      map[r.day] = r.printed_at;
    });
    return map;
  } catch {
    return {};
  }
};

export const markEventDaysPrinted = async (
  _companyId: number,
  quotationId: string,
  days: number[],
) => {
  if (!days.length) return { error: null };
  try {
    await apiRequest(API_ROUTES.LOGISTICS_KITCHEN_DAY_PRINTS, "POST", {
      quotation_id: quotationId,
      days,
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteEventKitchenNote = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_KITCHEN_NOTES}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Recetas por servicio ----------
export const getRecipeItems = async (
  _companyId: number,
  serviceType: RecipeServiceType,
  serviceId: number,
): Promise<RecipeItem[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_RECIPES,
      "GET",
      undefined,
      { serviceType, serviceId },
    );
    return (data || []) as RecipeItem[];
  } catch {
    return [];
  }
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
  try {
    const { company_id: _omitido, ...datos } = fields;
    await apiRequest(API_ROUTES.LOGISTICS_RECIPES, "POST", datos);
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const updateRecipeItem = async (
  id: number,
  fields: Partial<Pick<RecipeItem, "qty_per_person" | "unit">>,
) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_RECIPES}/${id}`, "PATCH", fields);
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteRecipeItem = async (id: number) => {
  try {
    await apiRequest(`${API_ROUTES.LOGISTICS_RECIPES}/${id}`, "DELETE");
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Costo de servicios fijos (tercerización / por persona) ----------
export const updateFixedServiceCosts = async (
  id: number,
  fields: { cost_fixed: number; cost_per_person: number },
) => {
  try {
    await apiRequest(
      `${API_ROUTES.LOGISTICS_FIXED_COSTS}/${id}`,
      "PATCH",
      fields,
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Recursos de gestión ----------
// MUDANZA #5 (28-07): por el backend, firmas idénticas.
export const getManagementResources = async (
  _companyId: number,
): Promise<ManagementResource[]> => {
  try {
    const data = await apiRequest(API_ROUTES.LOGISTICS_RESOURCES, "GET");
    return (data || []) as ManagementResource[];
  } catch {
    return [];
  }
};

export const createManagementResource = async (fields: {
  company_id: number;
  name: string;
  type: ManagementResource["type"];
  supplier_id?: number | null;
  list_price_fixed?: number | null;
  list_price_per_person?: number | null;
}) => {
  try {
    const { company_id: _omitido, ...datos } = fields;
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_RESOURCES,
      "POST",
      datos,
    );
    return { data: data as ManagementResource | null, error: null };
  } catch (error) {
    return { data: null, error };
  }
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
  try {
    await apiRequest(
      `${API_ROUTES.LOGISTICS_RESOURCES}/${id}`,
      "PATCH",
      fields,
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------- Líneas de costo de un servicio fijo (referencias a recursos) ----
export const getFixedServiceCostItems = async (
  _companyId: number,
  fixedServiceId: number,
): Promise<FixedServiceCostItem[]> => {
  try {
    const data = await apiRequest(
      API_ROUTES.LOGISTICS_FIXED_COST_ITEMS,
      "GET",
      undefined,
      { fixedServiceId },
    );
    return (data || []) as FixedServiceCostItem[];
  } catch {
    return [];
  }
};

export const addFixedServiceCostItem = async (fields: {
  company_id: number;
  fixed_service_id: number;
  resource_id: number;
  quantity: number;
}) => {
  try {
    const { company_id: _omitido, ...datos } = fields;
    await apiRequest(API_ROUTES.LOGISTICS_FIXED_COST_ITEMS, "POST", datos);
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const updateFixedServiceCostItem = async (
  id: number,
  fields: Partial<Pick<FixedServiceCostItem, "quantity">>,
) => {
  try {
    await apiRequest(
      `${API_ROUTES.LOGISTICS_FIXED_COST_ITEMS}/${id}`,
      "PATCH",
      fields,
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const deleteFixedServiceCostItem = async (id: number) => {
  try {
    await apiRequest(
      `${API_ROUTES.LOGISTICS_FIXED_COST_ITEMS}/${id}`,
      "DELETE",
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
};

// ---------------- VELOCIDAD 2.0 (28-07): paquetes por pantalla -------
// Un solo viaje para lo que antes eran 6 llamadas (catálogo) o 2
// (estado de compras). Las transformaciones son LAS MISMAS de las
// funciones sueltas de arriba — si cambias una, cambia la otra.
// Sin try/catch tragón a propósito: si el paquete falla, React Query
// reintenta y avisa (las funciones sueltas tragan errores por historia).

const mapNameIds = (data: {
  variable?: { id: number; name: string; no_cost?: boolean }[];
  fixed?: { id: number; name: string; no_cost?: boolean }[];
} | null): NameIdsConCosto => {
  const norm = canonicalServiceName;
  const variable: Record<string, number> = {};
  const sinCostoVariable: string[] = [];
  (data?.variable || []).forEach((s) => {
    variable[norm(s.name)] = s.id;
    if (s.no_cost) sinCostoVariable.push(norm(s.name));
  });
  const fixed: Record<string, number> = {};
  const sinCostoFijoIds: number[] = [];
  (data?.fixed || []).forEach((s) => {
    fixed[norm(s.name)] = s.id;
    if (s.no_cost) sinCostoFijoIds.push(s.id);
  });
  return { variable, fixed, sinCostoVariable, sinCostoFijoIds };
};

// Migración 57: además de los mapas nombre→id, viajan los marcados
// "sin costo en Eventia" para que Gestión no los regañe.
export interface NameIdsConCosto {
  variable: Record<string, number>;
  fixed: Record<string, number>;
  sinCostoVariable: string[]; // nombres canónicos
  sinCostoFijoIds: number[];
}

const mapFixedCosts = (
  data:
    | { id: number; cost_fixed: number | null; cost_per_person: number | null }[]
    | null,
): Record<number, { cost_fixed: number | null; cost_per_person: number | null }> => {
  const map: Record<
    number,
    { cost_fixed: number | null; cost_per_person: number | null }
  > = {};
  (data || []).forEach((r) => {
    map[r.id] = { cost_fixed: r.cost_fixed, cost_per_person: r.cost_per_person };
  });
  return map;
};

const mapEvento = (q: Record<string, unknown>): PurchasingEvent => ({
  ...(q as unknown as PurchasingEvent),
  client_name: ((q.clients as { name?: string } | null)?.name as string) || "—",
});

export const getBaseCatalogo = async (): Promise<{
  recipes: RecipeItem[];
  supplies: Supply[];
  furniture: FurnitureItem[];
  suppliers: Supplier[];
  nameIds: NameIdsConCosto;
  fixedCosts: Record<
    number,
    { cost_fixed: number | null; cost_per_person: number | null }
  >;
}> => {
  const data = await apiRequest("/logistics/base-catalogo", "GET");
  return {
    recipes: (data?.recipes || []) as RecipeItem[],
    supplies: (data?.supplies || []) as Supply[],
    furniture: (data?.furniture || []) as FurnitureItem[],
    suppliers: (data?.suppliers || []) as Supplier[],
    nameIds: mapNameIds(data?.nameIds),
    fixedCosts: mapFixedCosts(data?.fixedCosts),
  };
};

export const getEstadoCompras = async (): Promise<{
  events: PurchasingEvent[];
  provisions: EventSupplyProvision[];
}> => {
  const data = await apiRequest("/logistics/estado-compras", "GET");
  return {
    events: (data?.events || []).map(mapEvento),
    provisions: (data?.provisions || []) as EventSupplyProvision[],
  };
};
