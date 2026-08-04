import { Module } from '@nestjs/common';
import { QuotationFollowupsController } from './quotation-followups.controller';
import { QuotationFollowupsRepository } from './quotation-followups.repository';
import { QuotationFollowupsService } from './quotation-followups.service';

// SupabaseModule es @Global: el repositorio recibe SupabaseService
// sin importar nada acá (mismo esquema que refunds).
@Module({
  controllers: [QuotationFollowupsController],
  providers: [QuotationFollowupsService, QuotationFollowupsRepository],
  exports: [QuotationFollowupsService],
})
export class QuotationFollowupsModule {}
