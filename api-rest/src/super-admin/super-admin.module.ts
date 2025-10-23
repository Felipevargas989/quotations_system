import { forwardRef, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { CustomerSatisfactionSurveyModule } from 'src/customer_satisfaction_survey/module';
import { EmailModule } from 'src/email/email.module';
import { UsersModule } from 'src/users/users.module';
import { UsersRepository } from 'src/users/users.repository';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminRepository } from './super-admin.repository';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    LoggerModule,
    EmailModule,
    forwardRef(() => CustomerSatisfactionSurveyModule),
  ],
  controllers: [SuperAdminController],
  providers: [
    SuperAdminService,
    SuperAdminRepository,
    CompaniesRepository,
    UsersRepository,
  ],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
