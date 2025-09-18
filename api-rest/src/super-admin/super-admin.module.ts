import { Module } from '@nestjs/common';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { UsersRepository } from 'src/users/users.repository';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminRepository } from './super-admin.repository';
import { SuperAdminService } from './super-admin.service';

@Module({
  controllers: [SuperAdminController],
  providers: [
    SuperAdminService,
    SuperAdminRepository,
    CompaniesRepository,
    UsersRepository,
  ],
})
export class SuperAdminModule {}
