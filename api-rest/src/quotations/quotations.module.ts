import { Module, forwardRef } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { EmailModule } from 'src/email/email.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { RefundsModule } from 'src/refunds/refunds.module';
import { UsersModule } from 'src/users/users.module';
import {
  EventDocumentsController,
  EventDocumentsRepository,
} from './event-documents.controller';
import { QuotationsCronService } from './quotations-cron.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [
    RefundsModule,
    ClientsModule,
    EmailModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [QuotationsController, EventDocumentsController],
  providers: [
    QuotationsService,
    QuotationsRepository,
    QuotationsCronService,
    EventDocumentsRepository,
  ],
  exports: [QuotationsService, QuotationsRepository],
})
export class QuotationsModule {}
