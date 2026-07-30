import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { logSafe } from '../logging/log-safe';
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
      `createAnswer with quotationId ${quotationId}, templateId ${templateId}, answers ${logSafe(answers)}`,
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

  /** ¿La cotización ya tiene respuesta? (candado: una encuesta por evento) */
  async hasAnswer(quotationId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from('customer_satisfaction_survey_responses')
      .select('id')
      .eq('quotation_id', quotationId)
      .limit(1);
    return ((data || []) as { id: number }[]).length > 0;
  }

  /** Cotizaciones (de una lista) que ya tienen respuesta — para el portal. */
  async answeredSet(quotationIds: string[]): Promise<Set<string>> {
    if (!quotationIds.length) return new Set();
    const { data } = await this.supabase.client
      .from('customer_satisfaction_survey_responses')
      .select('quotation_id')
      .in('quotation_id', quotationIds);
    const rows = (data || []) as { quotation_id: string }[];
    return new Set(rows.map((r) => r.quotation_id));
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
