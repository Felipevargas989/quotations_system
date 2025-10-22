import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
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
}
