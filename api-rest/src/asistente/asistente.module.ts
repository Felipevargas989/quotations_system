import { Module } from '@nestjs/common';
import { CerebroModule } from 'src/cerebro/cerebro.module';
import { ClientsModule } from 'src/clients/clients.module';
import { LogisticsModule } from 'src/logistics/logistics.module';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { AsistenteController } from './asistente.controller';
import { AsistenteRepository } from './asistente.repository';
import { AsistenteService } from './asistente.service';
import { ConversacionRepository } from './conversacion/conversacion.repository';
import { ConversacionService } from './conversacion/conversacion.service';
import { LoLeido } from './conversacion/lo-leido';
import { CambioDeCliente } from './propuestas/cambio-de-cliente';
import { CotizacionNuevaService } from './propuestas/cotizacion-nueva.service';
import { LeccionesDesdeElChat } from './propuestas/lecciones-desde-el-chat';
import { PropuestasRepository } from './propuestas/propuestas.repository';
import { PropuestasService } from './propuestas/propuestas.service';
import { SeguimientoDesdeElChat } from './propuestas/seguimiento-desde-el-chat';

// BelIA, la IA de Eventia (doc 20). Lee con piezas que ya existen: la lista
// y el catálogo del cotizador (QuotationsModule), la bitácora
// (QuotationFollowupsModule) y la base de Compras (LogisticsModule). Los
// cambios que la persona aprueba se guardan con QuotationsService.update,
// la misma puerta del cotizador (fase 2).
@Module({
  imports: [
    QuotationsModule,
    QuotationFollowupsModule,
    LogisticsModule,
    // El portero de clientes parecidos, para «Crear evento».
    ClientsModule,
    // Lo que aprendió BelIA: las lecciones de cada empresa (doc 20 §17).
    CerebroModule,
  ],
  controllers: [AsistenteController],
  providers: [
    AsistenteService,
    AsistenteRepository,
    PropuestasService,
    PropuestasRepository,
    CotizacionNuevaService,
    // «Prepárame el seguimiento de la 600» (doc 20 §17, mejora 4).
    SeguimientoDesdeElChat,
    // Lo que aprende de las correcciones (doc 20 §17, mejora 5).
    LeccionesDesdeElChat,
    // Corregir un cliente mal clasificado (doc 21 §6).
    CambioDeCliente,
    // La conversación de cada persona (doc 20 §13, migración 182).
    ConversacionService,
    ConversacionRepository,
    // Lo que BelIA ya leyó, en la memoria del motor (04-11-2026).
    LoLeido,
  ],
})
export class AsistenteModule {}
