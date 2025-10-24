import { Module } from '@nestjs/common';
import { CompaniesModule } from 'src/companies/companies.module';
import { EmailService } from './email.service';

@Module({
  imports: [CompaniesModule],
  controllers: [],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
