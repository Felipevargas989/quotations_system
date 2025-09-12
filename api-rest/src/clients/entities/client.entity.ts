import { Company } from 'src/companies/entities/company.entity';

export class Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  client_type: string;
  address?: string;
  contact_person?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  company_id: Company['id'];
}
