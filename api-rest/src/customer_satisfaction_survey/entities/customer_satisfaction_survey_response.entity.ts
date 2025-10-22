import { Quotation } from 'src/quotations/entities/quotation.entity';

export type Answer = {
  id: number;
  answer: string;
};

export class CustomerSatisfactionSurveyResponse {
  id: number;
  created_at: Date;
  quotation_id: Quotation['id'];
  template_id: string;
  answers: Answer[];
}
