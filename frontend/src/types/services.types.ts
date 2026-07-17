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
  // Costo del servicio (no excluyentes): fijo por tercerización y/o variable
  // por persona. Costo en un evento = cost_fixed + cost_per_person × personas.
  cost_fixed?: number;
  cost_per_person?: number;
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
