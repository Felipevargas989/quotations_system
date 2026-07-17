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

export type ResourceType = "personal" | "arriendo";

export interface ManagementResource {
  id: number;
  company_id: number;
  name: string;
  type: ResourceType;
  last_price: number | null; // referencia: último precio usado en un evento
  is_active: boolean;
  created_at: string;
}
