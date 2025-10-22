import { Module } from '@nestjs/common';
import { CustomerSatisfactionSurveyController } from './customer_satisfaction_survey.controller';
import { CustomerSatisfactionSurveyService } from './customer_satisfaction_survey.service';

@Module({
  controllers: [CustomerSatisfactionSurveyController],
  providers: [CustomerSatisfactionSurveyService],
})
export class CustomerSatisfactionSurveyModule {}
