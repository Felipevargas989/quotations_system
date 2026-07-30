import { Company } from 'src/companies/entities/company.entity';
import { CalculationType } from '../constants';

export class VariableService {
  id: number;
  created_at: Date;
  code: string;
  name: string;
  price: number;
  category: string;
  is_active: boolean;
  company_id: Company['id'];
}
export class FixedService {
  id: number;
  created_at: Date;
  code: string;
  name: string;
  price: number;
  calculation_type: CalculationType;
  min_price: number;
  max_price: number;
  price_per_person: number;
  is_active: boolean;
  company_id: Company['id'];
  // Secciones de fijos (migración 53): UNA sección por servicio.
  section_id: number | null;
  sort_order: number | null;
}

// Sección de servicios fijos (migración 53): caja con nombre libre y
// orden arrastrable, espejo de ServiceCategory pero sin multi-vínculo.
export class FixedServiceSection {
  id: number;
  created_at: Date;
  company_id: Company['id'];
  name: string;
  is_active: boolean;
  sort_order: number | null;
}

// A service category is now a first-class entity (multi-category feature).
export class ServiceCategory {
  id: number;
  created_at: Date;
  name: string;
  is_active: boolean;
  sort_order: number | null;
  company_id: Company['id'];
}

// Link between a variable service and a category, with the service's order
// within that category. A service can be linked to many categories.
export class VariableServiceCategory {
  id: number;
  created_at: Date;
  company_id: Company['id'];
  variable_service_id: VariableService['id'];
  category_id: ServiceCategory['id'];
  sort_order: number | null;
}
