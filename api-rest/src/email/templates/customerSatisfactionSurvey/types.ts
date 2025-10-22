import { Client } from 'src/clients/entities/client.entity';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';

export type CustomerSatisfactionSurveyParams = {
  clientName: Client['name'];
  companyName: Company['name'];
  companyId: Company['id'];
  quotationId: Quotation['id'];
};
