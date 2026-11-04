import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { LogisticsModule } from 'src/logistics/logistics.module';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { AsistenteController } from './asistente.controller';
import { AsistenteRepository } from './asistente.repository';
import { AsistenteService } from './asistente.service';
import { CotizacionNuevaService } from './propuestas/cotizacion-nueva.service';
import { PropuestasRepository } from './propuestas/propuestas.repository';
import { PropuestasService } from './propuestas/propuestas.service';

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
  ],
  controllers: [AsistenteController],
  providers: [
    AsistenteService,
    AsistenteRepository,
    PropuestasService,
    PropuestasRepository,
    CotizacionNuevaService,
  ],
})
export class AsistenteModule {}
