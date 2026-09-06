import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { CompaniesModule } from 'src/companies/companies.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { ConsultasCronService } from './consultas-cron.service';
import { ConsultasController } from './consultas.controller';
import { ConsultasRepository } from './consultas.repository';
import { ConsultasService } from './consultas.service';
import { EventTypesController } from './event-types.controller';
import { EventTypesRepository } from './event-types.repository';
import { EventTypesService } from './event-types.service';

@Module({
  imports: [SupabaseModule, ClientsModule, CompaniesModule],
  controllers: [ConsultasController, EventTypesController],
  providers: [
    ConsultasService,
    ConsultasCronService,
    ConsultasRepository,
    EventTypesService,
    EventTypesRepository,
  ],
  exports: [ConsultasService],
})
export class ConsultasModule {}
