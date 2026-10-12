import { Company } from 'src/companies/entities/company.entity';
import { VariableService } from 'src/services/entities/service.entity';

export class ServiceGroupItem {
  id: number;
  created_at: Date;
  group_id: ServiceGroup['id'];
  variable_service_id: VariableService['id'];
  quantity: number;
}

export class ServiceGroup {
  id: number;
  created_at: Date;
  name: string;
  category: string;
  company_id: Company['id'];
  // Su grupo dentro de la categoría (12-10-2026, migración 121). Sin
  // grupo, va al final de "Usar menú guardado", bajo "Otros".
  menu_group_id?: MenuGroup['id'] | null;
}

// GRUPO DE MENÚS GUARDADOS (12-10-2026, migración 121): cada categoría
// tiene los suyos (Almuerzo: Nivel 1, Nivel 2, Nivel 3…). Mismas reglas
// que los grupos de paquetes (src/grupos-de-lista).
export class MenuGroup {
  id: number;
  company_id: Company['id'];
  category: string;
  name: string;
  sort_order: number;
  created_at: Date;
}
