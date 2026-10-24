import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { AdjuntosRepository } from './adjuntos/adjuntos.repository';
import { AdjuntosService } from './adjuntos/adjuntos.service';
import { LicifyService } from './adjuntos/licify.service';
import {
  AnalisisRepository,
  ValidacionRepository,
} from './analisis/analisis.repository';
import { AnalisisService } from './analisis/analisis.service';
import { ValidacionService } from './analisis/validacion.service';
import { AprendizajesController } from './aprendizajes/aprendizajes.controller';
import { AprendizajesRepository } from './aprendizajes/aprendizajes.repository';
import { AprendizajesService } from './aprendizajes/aprendizajes.service';
import { ComparacionController } from './comparacion/comparacion.controller';
import { ComparacionService } from './comparacion/comparacion.service';
import { ActasDeLaZonaService } from './competencia/actas.service';
import { CompetenciaCronService } from './competencia/competencia-cron.service';
import { CompetenciaController } from './competencia/competencia.controller';
import { CompetenciaRepository } from './competencia/competencia.repository';
import { CompetenciaService } from './competencia/competencia.service';
import { CotizantesService } from './competencia/cotizantes.service';
import { RubroService } from './competencia/rubro.service';
import { EventiaRepository } from './eventia/eventia.repository';
import { FichaRepository } from './ficha/ficha.repository';
import { GeneracionRepository } from './generacion/generacion.repository';
import { GeneracionService } from './generacion/generacion.service';
import { HistoriaRepository } from './historia/historia.repository';
import { HistoriaService } from './historia/historia.service';
import { SeVieneRepository } from './historia/se-viene.repository';
import { SeVieneService } from './historia/se-viene.service';
import { LecturaService } from './lectura/lectura.service';
import { MercadoPublicoClient } from './mercado-publico/mercado-publico.client';
import { MisLicitacionesService } from './mias/mis-licitaciones.service';
import { LeerRespaldoService } from './oferente/leer-respaldo.service';
import { OferenteRepository } from './oferente/oferente.repository';
import { OferenteService } from './oferente/oferente.service';
import { RespaldosDePostVentaService } from './oferente/respaldos-de-post-venta.service';
import { OportunidadesCronService } from './oportunidades-cron.service';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesRepository } from './oportunidades.repository';
import { OportunidadesService } from './oportunidades.service';
import { ArmarLaOfertaService } from './postulacion/armar-la-oferta.service';
import { ArmarPostulacionService } from './postulacion/armar-postulacion.service';
import { CotizacionDeLaPostulacionService } from './postulacion/cotizacion-de-la-postulacion.service';
import { ElSetService } from './postulacion/el-set.service';
import { LaExperienciaService } from './postulacion/la-experiencia.service';
import { LoPostuladoService } from './postulacion/lo-postulado.service';
import { PostulacionController } from './postulacion/postulacion.controller';
import { PostulacionRepository } from './postulacion/postulacion.repository';
import { PreguntasController } from './preguntas/preguntas.controller';
import { PreguntasRepository } from './preguntas/preguntas.repository';
import { PreguntasService } from './preguntas/preguntas.service';
import { RadarService } from './radar.service';
import { ResumenDeNegocioService } from './seguimiento/resumen-de-negocio.service';
import { SeguimientoController } from './seguimiento/seguimiento.controller';

// El módulo de Oportunidades (doc 17). Sprint 1: el radar; sprint 2: la
// pantalla (bandeja, ficha y configuración); después, las bases y anexos
// que sube la empresa (adjuntos/), lo que lee de ellas la IA (analisis/) y
// los documentos que hace la IA (generacion/: anexos, firma, propuesta).
// Desde el 19-10, la cotización de la postulación (postulacion/, decisión
// 29): usa el cotizador, los clientes y la bitácora.
@Module({
  imports: [QuotationsModule, ClientsModule, QuotationFollowupsModule],
  controllers: [
    CompetenciaController,
    PreguntasController,
    OportunidadesController,
    PostulacionController,
    SeguimientoController,
    ComparacionController,
    AprendizajesController,
  ],
  providers: [
    CompetenciaRepository,
    CompetenciaService,
    ActasDeLaZonaService,
    RubroService,
    CotizantesService,
    CompetenciaCronService,
    PreguntasRepository,
    PreguntasService,
    ResumenDeNegocioService,
    ComparacionService,
    AprendizajesRepository,
    AprendizajesService,
    PostulacionRepository,
    CotizacionDeLaPostulacionService,
    ArmarLaOfertaService,
    LoPostuladoService,
    ElSetService,
    ArmarPostulacionService,
    LaExperienciaService,
    MercadoPublicoClient,
    LecturaService,
    OportunidadesRepository,
    OportunidadesService,
    FichaRepository,
    AdjuntosRepository,
    AdjuntosService,
    LicifyService,
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
    LeerRespaldoService,
    RespaldosDePostVentaService,
    HistoriaRepository,
    HistoriaService,
    SeVieneRepository,
    SeVieneService,
    RadarService,
    OportunidadesCronService,
  ],
})
export class OportunidadesModule {}
