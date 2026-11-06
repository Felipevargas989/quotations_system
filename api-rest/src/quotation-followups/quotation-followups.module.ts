import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { QuotationFollowupsController } from './quotation-followups.controller';
import { QuotationFollowupsRepository } from './quotation-followups.repository';
import { QuotationFollowupsService } from './quotation-followups.service';

// SupabaseModule es @Global: el repositorio recibe SupabaseService
// sin importar nada acá (mismo esquema que refunds).
// ClientsModule: lo que ve cada cargo según el tipo de cliente (doc 22 §9).
@Module({
  imports: [ClientsModule],
  controllers: [QuotationFollowupsController],
  providers: [QuotationFollowupsService, QuotationFollowupsRepository],
  exports: [QuotationFollowupsService],
})
export class QuotationFollowupsModule {}
