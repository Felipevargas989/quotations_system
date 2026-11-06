import { Module, forwardRef } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { EmailModule } from 'src/email/email.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { CustomerSatisfactionSurveyController } from './controller';
import { CustomerSatisfactionSurveyRepository } from './repository';
import { CustomerSatisfactionSurveyService } from './service';

@Module({
  // ClientsModule: lo que ve cada cargo según el tipo de cliente (doc 22
  // §9.8).
  imports: [EmailModule, forwardRef(() => QuotationsModule), ClientsModule],
  controllers: [CustomerSatisfactionSurveyController],
  providers: [
    CustomerSatisfactionSurveyService,
    CustomerSatisfactionSurveyRepository,
  ],
  exports: [CustomerSatisfactionSurveyService],
})
export class CustomerSatisfactionSurveyModule {}
