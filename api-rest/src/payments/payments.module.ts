import { Module, forwardRef } from '@nestjs/common';
import { EmailModule } from 'src/email/email.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { PaymentsCronService } from './payments-cron.service';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [EmailModule, forwardRef(() => QuotationsModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, PaymentsCronService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
