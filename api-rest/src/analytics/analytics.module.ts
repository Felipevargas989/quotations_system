import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [QuotationsModule, ClientsModule, PaymentsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
