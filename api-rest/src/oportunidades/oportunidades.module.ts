import { Module } from '@nestjs/common';
import { AdjuntosRepository } from './adjuntos/adjuntos.repository';
import { AdjuntosService } from './adjuntos/adjuntos.service';
import {
  AnalisisRepository,
  ValidacionRepository,
} from './analisis/analisis.repository';
import { AnalisisService } from './analisis/analisis.service';
import { ValidacionService } from './analisis/validacion.service';
import { GeneracionRepository } from './generacion/generacion.repository';
import { GeneracionService } from './generacion/generacion.service';
import { HistoriaService } from './historia/historia.service';
import { LecturaService } from './lectura/lectura.service';
import { MercadoPublicoClient } from './mercado-publico/mercado-publico.client';
import { OferenteRepository } from './oferente/oferente.repository';
import { OferenteService } from './oferente/oferente.service';
import { OportunidadesCronService } from './oportunidades-cron.service';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesRepository } from './oportunidades.repository';
import { OportunidadesService } from './oportunidades.service';
import { RadarService } from './radar.service';

// El módulo de Oportunidades (doc 17). Sprint 1: el radar; sprint 2: la
// pantalla (bandeja, ficha y configuración); después, las bases y anexos
// que sube la empresa (adjuntos/), lo que lee de ellas la IA (analisis/) y
// los documentos que hace la IA (generacion/: anexos, firma, propuesta).
@Module({
  controllers: [OportunidadesController],
  providers: [
    MercadoPublicoClient,
    LecturaService,
    OportunidadesRepository,
    OportunidadesService,
    AdjuntosRepository,
    AdjuntosService,
    AnalisisRepository,
    AnalisisService,
    ValidacionRepository,
    ValidacionService,
    GeneracionRepository,
    GeneracionService,
    OferenteRepository,
    OferenteService,
    HistoriaService,
    RadarService,
    OportunidadesCronService,
  ],
})
export class OportunidadesModule {}
