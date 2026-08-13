import { Company } from 'src/companies/entities/company.entity';
import { ServiceGroup } from 'src/service-groups/entities/service-group.entity';
import { VariableService } from 'src/services/entities/service.entity';

export class ServiceGroupCollectionItem {
  id: number;
  created_at: Date;
  collection_id: ServiceGroupCollection['id'];
  service_group_id: ServiceGroup['id'];
}

// Servicio SUELTO del paquete (13-08): lo que no es un menú pero
// acompaña al programa — el alojamiento (N noches) y la fiesta. Antes
// había que disfrazarlos de menú para poder incluirlos.
export class ServiceGroupCollectionService {
  id: number;
  created_at: Date;
  collection_id: ServiceGroupCollection['id'];
  variable_service_id: VariableService['id'];
  quantity: number;
}

export class ServiceGroupCollection {
  id: number;
  created_at: Date;
  name: string;
  company_id: Company['id'];
}
