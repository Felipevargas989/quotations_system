import { Module } from '@nestjs/common';
import { CustomerSatisfactionSurveyController } from './controller';
import { CustomerSatisfactionSurveyRepository } from './repository';
import { CustomerSatisfactionSurveyService } from './service';

@Module({
  controllers: [CustomerSatisfactionSurveyController],
  providers: [
    CustomerSatisfactionSurveyService,
    CustomerSatisfactionSurveyRepository,
  ],
  exports: [CustomerSatisfactionSurveyService],
})
export class CustomerSatisfactionSurveyModule {}
