import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { CompaniesModule } from 'src/companies/companies.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { AudienciasService } from './audiencias.service';
import { BajasService } from './bajas.service';
import { MarketingCronService } from './marketing-cron.service';
import { MarketingController } from './marketing.controller';
import { MarketingRepository } from './marketing.repository';
import { MarketingService } from './marketing.service';

@Module({
  // ClientsModule: las marcas de convenio y los tipos particulares, para
  // el filtro «Convenio» de las audiencias (doc 24 §9).
  imports: [SupabaseModule, CompaniesModule, ClientsModule],
  controllers: [MarketingController],
  providers: [
    AudienciasService,
    BajasService,
    MarketingCronService,
    MarketingService,
    MarketingRepository,
  ],
})
export class MarketingModule {}
