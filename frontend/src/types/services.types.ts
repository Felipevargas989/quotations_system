import { CalculationType } from "../constants/services";
import { Company } from "./companies.types";

export interface VariableService {
  id: number;
  created_at: Date;
  code?: string;
  name: string;
  price: number;
  category: string;
  is_active?: boolean;
  // Migración 57: no lleva costos dentro de Eventia (Ticket diario,
  // alojamientos…) — cuenta $0 real y no figura como pendiente.
  no_cost?: boolean;
  company_id: Company["id"];
}
export interface FixedService {
  id: number;
  created_at: Date;
  code?: string;
  name: string;
  price?: number;
  calculation_type: CalculationType;
  min_price?: number;
  max_price?: number;
  price_per_person?: number;
  is_active?: boolean;
  company_id: Company["id"];
  // Secciones de fijos (migración 53): UNA sección por servicio.
  section_id?: number | null;
  sort_order?: number | null;
  // Costo del servicio (no excluyentes): fijo por tercerización y/o variable
  // por persona. Costo en un evento = cost_fixed + cost_per_person × personas.
  cost_fixed?: number;
  cost_per_person?: number;
  // Migración 57: no lleva costos dentro de Eventia (Exclusividad…).
  no_cost?: boolean;
}

// A service category is now a first-class entity.
export interface ServiceCategorySetting {
  id: number;
  created_at: Date;
  name: string;
  is_active: boolean;
  sort_order?: number | null;
  company_id: Company["id"];
}

// Link between a variable service and a category, with per-category order.
export interface VariableServiceCategoryLink {
  id: number;
  created_at: Date;
  company_id: Company["id"];
  variable_service_id: number;
  category_id: number;
  sort_order?: number | null;
  // Sección de la categoría a la que pertenece este vínculo (null = sin sección)
  section_id?: number | null;
}

// Sección dentro de una categoría (Entradas / Fondos / Postres...), como una
// carta real. Cada categoría define las suyas. A lo más UNA por categoría es
// "fija": sus servicios se agregan solos al cotizar la categoría y no se
// pueden quitar mientras la categoría siga en el evento.
export interface CategorySection {
  id: number;
  company_id: number;
  category_id: number;
  name: string;
  sort_order: number;
  is_default?: boolean;
}

export type CreateVariableService = Partial<
  Omit<VariableService, "id" | "created_at" | "company_id">
> & {
  // Categories this service belongs to (multi-category).
  category_ids?: number[];
};

export type CreateFixedService = Omit<
  FixedService,
  "id" | "created_at" | "company_id"
>;

export type CreateServicesBulkDto = {
  variable_services: CreateVariableService[];
  fixed_services: CreateFixedService[];
};

export type UpdateFixedServiceDto = Partial<
  Omit<FixedService, "id" | "created_at" | "company_id">
>;
export type UpdateVariableServiceDto = Partial<
  Omit<VariableService, "id" | "created_at" | "company_id">
>;

// Sección de servicios fijos (migración 53): caja con nombre libre y
// orden arrastrable, espejo de las categorías de variables.
export interface FixedSection {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number | null;
  company_id: Company["id"];
}
