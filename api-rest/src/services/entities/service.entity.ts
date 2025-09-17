import { Company } from 'src/companies/entities/company.entity';

export class VariableService {
  id: number;
  created_at: Date;
  code: string;
  name: string;
  price: number;
  category: string;
  company_id: Company['id'];
}
export class FixedService {
  id: number;
  created_at: Date;
  code: string;
  name: string;
  price: number;
  calculation_type: string;
  min_price: number;
  max_price: number;
  price_per_person: number;
  company_id: Company['id'];
}
