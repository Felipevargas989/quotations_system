import { Company } from 'src/companies/entities/company.entity';

type Question = {
  id: number;
  question: string;
  type: 'text';
  options?: string[];
};
export class CustomerSatisfactionSurveyTemplate {
  id: number;
  created_at: Date;
  company_id: Company['id'];
  j;
  questions: Question[];
}
