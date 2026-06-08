import { Company } from "./companies.types";
import { ServiceGroup } from "./serviceGroups.types";

export interface ServiceGroupCollectionItem {
  // joined service group, with its own items/variable services nested
  group: ServiceGroup;
}

export interface ServiceGroupCollection {
  id: number;
  created_at: Date;
  name: string;
  company_id: Company["id"];
  groups: ServiceGroupCollectionItem[];
}

export interface CreateServiceGroupCollection {
  name: string;
  items: { service_group_id: ServiceGroup["id"] }[];
}
