import { Module } from '@nestjs/common';
import { CompaniesModule } from 'src/companies/companies.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { AudienciasService } from './audiencias.service';
import { BajasService } from './bajas.service';
import { MarketingController } from './marketing.controller';
import { MarketingRepository } from './marketing.repository';
import { MarketingService } from './marketing.service';

@Module({
  imports: [SupabaseModule, CompaniesModule],
  controllers: [MarketingController],
  providers: [
    AudienciasService,
    BajasService,
    MarketingService,
    MarketingRepository,
  ],
})
export class MarketingModule {}
