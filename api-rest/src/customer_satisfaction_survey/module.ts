import { Module } from '@nestjs/common';
import { CustomerSatisfactionSurveyController } from './controller';
import { CustomerSatisfactionSurveyService } from './service';

@Module({
  controllers: [CustomerSatisfactionSurveyController],
  providers: [CustomerSatisfactionSurveyService],
})
export class CustomerSatisfactionSurveyModule {}
