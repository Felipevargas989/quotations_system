// Tipos del módulo Logística (catálogos base).

// Familias de unidad (convención Fudo): la unidad de una receta debe
// pertenecer a la familia del insumo, nunca cruzarse.
export type UnitFamily = "masa" | "volumen" | "unidad";

export const UNIT_FAMILY_INFO: Record<
  UnitFamily,
  { label: string; units: string; base: string }
> = {
  masa: { label: "Masa", units: "kg / gr", base: "kg" },
  volumen: { label: "Volumen", units: "L / ml", base: "L" },
  unidad: { label: "Unidad", units: "u / fracción", base: "u" },
};

export interface Supplier {
  id: number;
  company_id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Supply {
  id: number;
  company_id: number;
  name: string;
  unit_family: UnitFamily;
  price: number; // por unidad base (kg / L / unidad)
  supplier_id: number | null;
  is_active: boolean;
  created_at: string;
}

// Unidades concretas permitidas en recetas, por familia del insumo.
export type RecipeUnit = "kg" | "gr" | "L" | "ml" | "u";

export const UNITS_BY_FAMILY: Record<UnitFamily, RecipeUnit[]> = {
  masa: ["kg", "gr"],
  volumen: ["L", "ml"],
  unidad: ["u"],
};

// Convierte una cantidad de receta a la unidad base del insumo (kg/L/u).
export const toBaseQty = (qty: number, unit: RecipeUnit): number =>
  unit === "gr" || unit === "ml" ? qty / 1000 : qty;

export interface FurnitureItem {
  id: number;
  company_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export type RecipeServiceType = "variable" | "fixed";

export interface RecipeItem {
  id: number;
  company_id: number;
  service_type: RecipeServiceType;
  service_id: number;
  item_kind: "insumo" | "mobiliario";
  supply_id: number | null;
  furniture_id: number | null;
  qty_per_person: number;
  unit: RecipeUnit;
  created_at: string;
}

export type ResourceType = "personal" | "arriendo" | "compra";

// Modo de cobro del recurso: por evento (monto único) o por persona.
export type ChargeMode = "por_evento" | "por_persona";

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  personal: "Personal",
  arriendo: "Arriendo",
  compra: "Compra",
};

export const CHARGE_MODE_LABEL: Record<ChargeMode, string> = {
  por_evento: "por evento",
  por_persona: "por persona",
};

export interface ManagementResource {
  id: number;
  company_id: number;
  name: string;
  type: ResourceType;
  last_price: number | null; // referencia: último precio usado en un evento
  is_active: boolean;
  created_at: string;
  // Lista de precios de terceros (opcional): proveedor, precio de lista y
  // modo de cobro. El staff puede ir sin precio (se asigna por evento).
  supplier_id: number | null;
  list_price: number | null;
  charge_mode: ChargeMode;
}

// Línea de costo de un servicio fijo: referencia a un recurso del catálogo.
// El costo se calcula en vivo desde el precio de lista del recurso.
export interface FixedServiceCostItem {
  id: number;
  company_id: number;
  fixed_service_id: number;
  resource_id: number;
  quantity: number;
  created_at: string;
}
