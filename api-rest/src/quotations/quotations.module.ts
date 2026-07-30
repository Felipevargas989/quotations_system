import { Module, forwardRef } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { EmailModule } from 'src/email/email.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { RefundsModule } from 'src/refunds/refunds.module';
import { StorageModule } from 'src/storage/storage.module';
import { UsersModule } from 'src/users/users.module';
import {
  EventDocumentsController,
  EventDocumentsRepository,
} from './event-documents.controller';
import {
  PortalReceiptsController,
  PortalReceiptsRepository,
} from './portal-receipts.controller';
import { PortalController } from './portal.controller';
import { QuotationsCronService } from './quotations-cron.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [
    RefundsModule,
    ClientsModule,
    EmailModule,
    StorageModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [
    QuotationsController,
    EventDocumentsController,
    PortalController,
    PortalReceiptsController,
  ],
  providers: [
    QuotationsService,
    QuotationsRepository,
    QuotationsCronService,
    EventDocumentsRepository,
    PortalReceiptsRepository,
  ],
  exports: [QuotationsService, QuotationsRepository],
})
export class QuotationsModule {}
