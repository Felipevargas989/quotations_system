import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { AdjuntosRepository } from './adjuntos/adjuntos.repository';
import { AdjuntosService } from './adjuntos/adjuntos.service';
import {
  AnalisisRepository,
  ValidacionRepository,
} from './analisis/analisis.repository';
import { AnalisisService } from './analisis/analisis.service';
import { ValidacionService } from './analisis/validacion.service';
import { EventiaRepository } from './eventia/eventia.repository';
import { FichaRepository } from './ficha/ficha.repository';
import { GeneracionRepository } from './generacion/generacion.repository';
import { GeneracionService } from './generacion/generacion.service';
import { HistoriaRepository } from './historia/historia.repository';
import { HistoriaService } from './historia/historia.service';
import { LecturaService } from './lectura/lectura.service';
import { MercadoPublicoClient } from './mercado-publico/mercado-publico.client';
import { MisLicitacionesService } from './mias/mis-licitaciones.service';
import { OferenteRepository } from './oferente/oferente.repository';
import { OferenteService } from './oferente/oferente.service';
import { OportunidadesCronService } from './oportunidades-cron.service';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesRepository } from './oportunidades.repository';
import { OportunidadesService } from './oportunidades.service';
import { CotizacionDeLaPostulacionService } from './postulacion/cotizacion-de-la-postulacion.service';
import { PostulacionController } from './postulacion/postulacion.controller';
import { PostulacionRepository } from './postulacion/postulacion.repository';
import { RadarService } from './radar.service';

// El módulo de Oportunidades (doc 17). Sprint 1: el radar; sprint 2: la
// pantalla (bandeja, ficha y configuración); después, las bases y anexos
// que sube la empresa (adjuntos/), lo que lee de ellas la IA (analisis/) y
// los documentos que hace la IA (generacion/: anexos, firma, propuesta).
// Desde el 19-10, la cotización de la postulación (postulacion/, decisión
// 29): usa el cotizador, los clientes y la bitácora.
@Module({
  imports: [QuotationsModule, ClientsModule, QuotationFollowupsModule],
  controllers: [OportunidadesController, PostulacionController],
  providers: [
    PostulacionRepository,
    CotizacionDeLaPostulacionService,
    MercadoPublicoClient,
    LecturaService,
    OportunidadesRepository,
    OportunidadesService,
    FichaRepository,
    AdjuntosRepository,
    AdjuntosService,
    AnalisisRepository,
    AnalisisService,
    ValidacionRepository,
    ValidacionService,
    GeneracionRepository,
    GeneracionService,
    MisLicitacionesService,
    EventiaRepository,
    OferenteRepository,
    OferenteService,
    HistoriaRepository,
    HistoriaService,
    RadarService,
    OportunidadesCronService,
  ],
})
export class OportunidadesModule {}
