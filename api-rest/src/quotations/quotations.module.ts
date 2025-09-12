import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';

@Module({
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationsRepository],
})
export class QuotationsModule {}
