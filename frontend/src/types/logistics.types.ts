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

export type FurnitureCategory =
  | "cristaleria"
  | "cuchilleria"
  | "vajilla"
  | "mobiliario"
  | "otro";

export const FURNITURE_CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  cristaleria: "Cristalería",
  cuchilleria: "Cuchillería",
  vajilla: "Vajilla",
  mobiliario: "Mobiliario",
  otro: "Otro",
};

export interface FurnitureItem {
  id: number;
  company_id: number;
  name: string;
  category: FurnitureCategory;
  stock: number; // unidades disponibles (fluctúa por temporada)
  photo_url: string | null; // foto de referencia (popup, no descarga)
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

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  personal: "Personal",
  arriendo: "Arriendo",
  compra: "Compra",
};

export interface ManagementResource {
  id: number;
  company_id: number;
  name: string;
  type: ResourceType;
  last_price: number | null; // referencia: último precio usado en un evento
  is_active: boolean;
  created_at: string;
  // Lista de precios de terceros: DOS componentes no excluyentes, espejo del
  // modelo de cobro (fijo / fijo + variable). Ej: silla = $100.000 transporte
  // (fijo) + $1.500 por silla (por persona). El staff puede ir sin precios
  // (se asigna por evento).
  supplier_id: number | null;
  list_price_fixed: number | null;
  list_price_per_person: number | null;
}

// Etiqueta corta del precio de lista de un recurso.
export const resourcePriceLabel = (r: {
  list_price_fixed: number | null;
  list_price_per_person: number | null;
}): string => {
  const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
  const fixed = r.list_price_fixed || 0;
  const pp = r.list_price_per_person || 0;
  if (fixed > 0 && pp > 0) return `${clp(fixed)} + ${clp(pp)}/persona`;
  if (fixed > 0) return `${clp(fixed)} /evento`;
  if (pp > 0) return `${clp(pp)} /persona`;
  return "sin precio";
};

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
