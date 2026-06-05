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
}
