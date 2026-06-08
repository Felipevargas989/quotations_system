import { Company } from 'src/companies/entities/company.entity';
import { ServiceGroup } from 'src/service-groups/entities/service-group.entity';

export class ServiceGroupCollectionItem {
  id: number;
  created_at: Date;
  collection_id: ServiceGroupCollection['id'];
  service_group_id: ServiceGroup['id'];
}

export class ServiceGroupCollection {
  id: number;
  created_at: Date;
  name: string;
  company_id: Company['id'];
}
