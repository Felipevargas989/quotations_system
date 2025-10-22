import { Company } from 'src/companies/entities/company.entity';

export type Question = {
  id: number;
  question: string;
  type: 'text' | 'number' | 'boolean';
  options?: number[] | string[];
};
export class CustomerSatisfactionSurveyTemplate {
  id: number;
  created_at: Date;
  company_id: Company['id'];
  questions: Question[];
}
