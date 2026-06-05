import { Company } from "./companies.types";
import { VariableService } from "./services.types";

export interface ServiceGroupItem {
  quantity: number;
  // joined live variable service row
  service: VariableService;
}

export interface ServiceGroup {
  id: number;
  created_at: Date;
  name: string;
  category: string;
  company_id: Company["id"];
  items: ServiceGroupItem[];
}

export interface CreateServiceGroupItem {
  variable_service_id: VariableService["id"];
  quantity: number;
}

export interface CreateServiceGroup {
  name: string;
  category: string;
  items: CreateServiceGroupItem[];
}
