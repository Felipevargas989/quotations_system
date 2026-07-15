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
}

// Activation state for a service category (categories are free-text strings on
// variable_services.category; a category with no row here is active by default).
export class ServiceCategory {
  id: number;
  created_at: Date;
  name: string;
  is_active: boolean;
  company_id: Company['id'];
}
