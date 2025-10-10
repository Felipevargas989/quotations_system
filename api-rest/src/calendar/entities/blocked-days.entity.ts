import { Company } from 'src/companies/entities/company.entity';

export class BlockedDays {
  id: string;
  created_at: Date;
  date: Date;
  company_id: Company['id'];
}
