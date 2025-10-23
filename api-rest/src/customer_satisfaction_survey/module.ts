import { Module } from '@nestjs/common';
import { EmailModule } from 'src/email/email.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { CustomerSatisfactionSurveyController } from './controller';
import { CustomerSatisfactionSurveyRepository } from './repository';
import { CustomerSatisfactionSurveyService } from './service';

@Module({
  imports: [EmailModule, QuotationsModule],
  controllers: [CustomerSatisfactionSurveyController],
  providers: [
    CustomerSatisfactionSurveyService,
    CustomerSatisfactionSurveyRepository,
  ],
  exports: [CustomerSatisfactionSurveyService],
})
export class CustomerSatisfactionSurveyModule {}
