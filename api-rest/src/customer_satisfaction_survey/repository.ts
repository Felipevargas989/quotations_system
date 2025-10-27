import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CustomerSatisfactionSurveyResponse } from './entities/customer_satisfaction_survey_response.entity';
import { CustomerSatisfactionSurveyTemplate } from './entities/customer_satisfaction_survey_template.entity';

@Injectable()
export class CustomerSatisfactionSurveyRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomerSatisfactionSurveyRepository.name);
  }

  async createTemplate(
    companyId: Company['id'],
    questions: CustomerSatisfactionSurveyTemplate['questions'],
  ): Promise<{
    data: CustomerSatisfactionSurveyTemplate | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `createTemplate with companyId ${companyId} and questions ${JSON.stringify(questions)}`,
    );

    const templateData: Pick<
      CustomerSatisfactionSurveyTemplate,
      'company_id' | 'questions'
    > = {
      company_id: companyId,
      questions,
    };

    return await this.supabase.client
      .from('customer_satisfaction_survey_templates')
      .insert([templateData])
      .select()
      .single();
  }

  async createAnswer(
    quotationId: Quotation['id'],
    templateId: CustomerSatisfactionSurveyTemplate['id'],
    answers: CustomerSatisfactionSurveyResponse['answers'],
  ): Promise<{
    data: CustomerSatisfactionSurveyResponse | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `createAnswer with quotationId ${quotationId}, templateId ${templateId}, answers ${JSON.stringify(answers)}`,
    );

    const answerData = {
      quotation_id: quotationId,
      template_id: templateId,
      answers: answers,
    };

    return await this.supabase.client
      .from('customer_satisfaction_survey_responses')
      .insert([answerData])
      .select()
      .single();
  }

  async getTemplate(companyId: Company['id']): Promise<{
    data: CustomerSatisfactionSurveyTemplate | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`getTemplate with companyId ${companyId}`);

    return await this.supabase.client
      .from('customer_satisfaction_survey_templates')
      .select('*')
      .eq('company_id', companyId)
      .single();
  }

  async findAllAnswersFromCompany(companyId: Company['id']): Promise<{
    data: CustomerSatisfactionSurveyResponse[] | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`findAllAnswersFromCompany with companyId ${companyId}`);

    return await this.supabase.client
      .from('customer_satisfaction_survey_responses')
      .select(
        `
        *,
        quotations (
          id,
          quotation_number,
          event_date,
          event_type,
          company_id,
          clients (
            name
          )
        )
        `,
      )
      .eq('quotations.company_id', companyId);
  }
}
