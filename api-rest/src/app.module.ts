import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthGuard } from './auth';
import { AuthModule } from './auth/auth.module';
import { RolesGuard } from './auth/roles.guard';
import { BackupModule } from './backup/backup.module';
import { CalendarModule } from './calendar/calendar.module';
import { ClientsModule } from './clients/clients.module';
import { CompaniesModule } from './companies/companies.module';
import { CustomerSatisfactionSurveyModule } from './customer_satisfaction_survey/module';
import { EmailModule } from './email/email.module';
import { HealthController } from './health/health.controller';
import { LogisticsModule } from './logistics/logistics.module';
import { PaymentsModule } from './payments/payments.module';
import { PlansModule } from './plans/plans.module';
import { QuotationsModule } from './quotations/quotations.module';
import { RefundsModule } from './refunds/refunds.module';
import { ServiceGroupCollectionsModule } from './service-group-collections/service-group-collections.module';
import { ServiceGroupsModule } from './service-groups/service-groups.module';
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
        // Fase 3 (28-07): el token de sesión completo quedaba escrito
        // en el log de CADA petición. Redactado de raíz.
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          censor: '[REDACTADO]',
        },
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
          },
        },
      },
    }),
    // Fase 3 (28-07): protección contra consultas masivas. Techo
    // general holgado por IP (el uso normal de la app queda lejos);
    // los accesos PÚBLICOS llevan techos más estrictos con @Throttle
    // en sus controllers.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
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
    ServiceGroupsModule,
    ServiceGroupCollectionsModule,
    EmailModule,
    CustomerSatisfactionSurveyModule,
    BackupModule,
    LogisticsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    // El portero de frecuencia corre para TODAS las rutas (incluidas
    // las @Public): demasiadas peticiones desde una IP → 429.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Fase 3: el cargo se aplica en el backend. DEBE ir después de
    // AuthGuard (que deja request.user con el cargo).
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
