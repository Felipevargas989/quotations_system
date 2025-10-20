import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { EmailModule } from 'src/email/email.module';
import { PaymentsRepository } from 'src/payments/payments.repository';
import { PaymentsService } from 'src/payments/payments.service';
import { RefundsModule } from 'src/refunds/refunds.module';
import { QuotationsCronService } from './quotations-cron.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [RefundsModule, ClientsModule, EmailModule],
  controllers: [QuotationsController],
  providers: [
    QuotationsService,
    QuotationsRepository,
    QuotationsCronService,
    PaymentsService,
    PaymentsRepository,
  ],
  exports: [QuotationsService],
})
export class QuotationsModule {}
