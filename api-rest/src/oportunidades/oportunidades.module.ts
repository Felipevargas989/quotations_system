import { Module } from '@nestjs/common';
import { LecturaService } from './lectura/lectura.service';
import { MercadoPublicoClient } from './mercado-publico/mercado-publico.client';
import { OportunidadesCronService } from './oportunidades-cron.service';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesRepository } from './oportunidades.repository';
import { RadarService } from './radar.service';

// El módulo de Oportunidades (doc 17). Sprint 1: el radar.
@Module({
  controllers: [OportunidadesController],
  providers: [
    MercadoPublicoClient,
    LecturaService,
    OportunidadesRepository,
    RadarService,
    OportunidadesCronService,
  ],
})
export class OportunidadesModule {}
