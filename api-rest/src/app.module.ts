import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './auth';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CompaniesModule } from './companies/companies.module';
import { PaymentsModule } from './payments/payments.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ServicesModule } from './services/services.module';
import { SupabaseModule } from './supabase/supabase.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // makes ConfigService available everywhere without importing
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
