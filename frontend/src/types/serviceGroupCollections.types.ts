import { Company } from "./companies.types";
import { ServiceGroup } from "./serviceGroups.types";
import { VariableService } from "./services.types";

export interface ServiceGroupCollectionItem {
  // joined service group, with its own items/variable services nested
  group: ServiceGroup;
}

// Servicio SUELTO del paquete (13-08): el alojamiento (N noches) y la
// fiesta. Antes había que disfrazarlos de menú para poder incluirlos.
export interface ServiceGroupCollectionService {
  quantity: number;
  service: VariableService;
}

export interface ServiceGroupCollection {
  id: number;
  created_at: Date;
  name: string;
  company_id: Company["id"];
  groups: ServiceGroupCollectionItem[];
  services?: ServiceGroupCollectionService[];
}

export interface CreateServiceGroupCollection {
  name: string;
  items: { service_group_id: ServiceGroup["id"] }[];
  services?: { variable_service_id: VariableService["id"]; quantity: number }[];
}
