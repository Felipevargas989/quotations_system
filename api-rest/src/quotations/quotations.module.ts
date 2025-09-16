import { Module } from '@nestjs/common';
import { PaymentsRepository } from 'src/payments/payments.repository';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  controllers: [QuotationsController],
  providers: [
    QuotationsService,
    QuotationsRepository,
    PaymentsService,
    PaymentsRepository,
  ],
})
export class QuotationsModule {}
