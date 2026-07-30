import { Module } from '@nestjs/common';
import { CompaniesModule } from 'src/companies/companies.module';
import { EmailPreviewsController } from './email-previews.controller';
import { EmailService } from './email.service';

@Module({
  imports: [CompaniesModule],
  controllers: [EmailPreviewsController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
