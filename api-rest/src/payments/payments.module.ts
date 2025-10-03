import { Module } from '@nestjs/common';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, QuotationsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
