import { Company } from 'src/companies/entities/company.entity';
import { ServiceGroup } from 'src/service-groups/entities/service-group.entity';
import {
  FixedService,
  VariableService,
} from 'src/services/entities/service.entity';

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

// Servicio FIJO del paquete (28-08, Felipe: "el salón y la decoración
// SON parte del paquete"). Espejo del suelto variable.
export class ServiceGroupCollectionFixedService {
  id: number;
  created_at: Date;
  collection_id: ServiceGroupCollection['id'];
  fixed_service_id: FixedService['id'];
  quantity: number;
}

export class ServiceGroupCollection {
  id: number;
  created_at: Date;
  name: string;
  company_id: Company['id'];
  // Su grupo en "Partir de un paquete" (12-10-2026, migración 120). Sin
  // grupo, va al final bajo "Otros".
  package_group_id?: PackageGroup['id'] | null;
}

// GRUPO DE PAQUETES (12-10-2026, migración 120). Felipe: "mejor crear y
// editar listas, es más fácil que una sección que se arme por el nombre
// del paquete". Una lista con nombre y orden: Full day, Alojamiento…
export class PackageGroup {
  id: number;
  company_id: Company['id'];
  name: string;
  sort_order: number;
  created_at: Date;
}
