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
  // Su grupo dentro de la categoría (12-10-2026, migración 121). Sin
  // grupo, va al final de "Usar menú guardado", bajo "Otros".
  menu_group_id?: GrupoDeMenus["id"] | null;
}

// GRUPO DE MENÚS GUARDADOS (12-10-2026, migración 121): cada categoría
// con los suyos (Almuerzo: Nivel 1, Nivel 2, Nivel 3…).
export interface GrupoDeMenus {
  id: number;
  name: string;
  category: string;
  sort_order: number;
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
