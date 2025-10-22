import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateAnswerDto } from './dto/create-answer.dto';
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

  async createAnswer(createAnswerDto: CreateAnswerDto): Promise<{
    data: CustomerSatisfactionSurveyResponse | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `createAnswer with createAnswerDto ${JSON.stringify(createAnswerDto)}`,
    );

    // Get the company_id from the quotation to find the template
    const quotationResult = await this.supabase.client
      .from('quotations')
      .select('company_id')
      .eq('id', createAnswerDto.quotationId)
      .single();

    if (quotationResult.error) {
      this.logger.error(
        `Error finding quotation: ${quotationResult.error.message}`,
      );
      return {
        data: null,
        error: quotationResult.error,
      };
    }

    // Get the template for this company to get the template_id
    const templateResult = await this.supabase.client
      .from('customer_satisfaction_survey_templates')
      .select('id')
      .eq('company_id', quotationResult.data.company_id)
      .single();

    if (templateResult.error) {
      this.logger.error(
        `Error finding template: ${templateResult.error.message}`,
      );
      return {
        data: null,
        error: templateResult.error,
      };
    }

    const answerData = {
      quotation_id: createAnswerDto.quotationId,
      template_id: templateResult.data.id,
      answers: createAnswerDto.answers,
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
}
