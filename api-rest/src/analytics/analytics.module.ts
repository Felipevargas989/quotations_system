import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { EmailModule } from 'src/email/email.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { UsersModule } from 'src/users/users.module';
import { AnalyticsCronService } from './analyitics-cront.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    QuotationsModule,
    ClientsModule,
    PaymentsModule,
    UsersModule,
    EmailModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsCronService],
})
export class AnalyticsModule {}
