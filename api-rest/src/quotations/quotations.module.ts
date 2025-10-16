import { Module } from '@nestjs/common';
import { PaymentsRepository } from 'src/payments/payments.repository';
import { PaymentsService } from 'src/payments/payments.service';
import { RefundsModule } from 'src/refunds/refunds.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [RefundsModule],
  controllers: [QuotationsController],
  providers: [
    QuotationsService,
    QuotationsRepository,
    PaymentsService,
    PaymentsRepository,
  ],
  exports: [QuotationsService],
})
export class QuotationsModule {}
