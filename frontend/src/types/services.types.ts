import { CalculationType } from "../constants/services";
import { Company } from "./companies.types";

export interface VariableService {
  id: number;
  created_at: Date;
  code?: string;
  name: string;
  price: number;
  category: string;
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
  company_id: Company["id"];
}

export type CreateVariableService = Partial<
  Omit<VariableService, "id" | "created_at" | "company_id">
>;

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
