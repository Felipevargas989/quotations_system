import { Module } from '@nestjs/common';
import { EmailModule } from 'src/email/email.module';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { PaymentsCronService } from './payments-cron.service';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [EmailModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    QuotationsRepository,
    PaymentsCronService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
