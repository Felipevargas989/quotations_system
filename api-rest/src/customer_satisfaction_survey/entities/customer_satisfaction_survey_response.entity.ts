import { Client } from 'src/clients/entities/client.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';

type Answer = {
  id: number;
  answer: string;
};

export class CustomerSatisfactionSurveyResponse {
  id: number;
  created_at: Date;
  quotation_id: Quotation['id'];
  client_id: Client['id'];
  template_id: string;
  answers: Answer[];
}
