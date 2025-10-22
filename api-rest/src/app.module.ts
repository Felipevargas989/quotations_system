import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthGuard } from './auth';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { ClientsModule } from './clients/clients.module';
import { CompaniesModule } from './companies/companies.module';
import { CustomerSatisfactionSurveyModule } from './customer_satisfaction_survey/module';
import { EmailModule } from './email/email.module';
import { PaymentsModule } from './payments/payments.module';
import { PlansModule } from './plans/plans.module';
import { QuotationsModule } from './quotations/quotations.module';
import { RefundsModule } from './refunds/refunds.module';
import { ServicesModule } from './services/services.module';
import { SupabaseModule } from './supabase/supabase.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // makes ConfigService available everywhere without importing
    }),
    ScheduleModule.forRoot({
      // allow cron jobs to run only in production
      cronJobs: process.env.NODE_ENV === 'production',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
          },
        },
      },
    }),
    AuthModule,
    ConfigModule,
    SupabaseModule,
    CompaniesModule,
    UsersModule,
    ClientsModule,
    QuotationsModule,
    PaymentsModule,
    ServicesModule,
    SuperAdminModule,
    AnalyticsModule,
    CalendarModule,
    PlansModule,
    RefundsModule,
    EmailModule,
    CustomerSatisfactionSurveyModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
