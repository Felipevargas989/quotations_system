import { Client } from 'src/clients/entities/client.entity';
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
  quotations: Pick<
    Quotation,
    'id' | 'quotation_number' | 'event_date' | 'event_type' | 'company_id'
  > & { clients: Pick<Client, 'name'> };
}
