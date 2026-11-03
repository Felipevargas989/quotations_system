import { Module } from '@nestjs/common';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { AsistenteController } from './asistente.controller';
import { AsistenteRepository } from './asistente.repository';
import { AsistenteService } from './asistente.service';

// Evia, la IA de Eventia (doc 20). Lee con piezas que ya existen: la lista
// y el catálogo del cotizador (QuotationsModule) y la bitácora
// (QuotationFollowupsModule).
@Module({
  imports: [QuotationsModule, QuotationFollowupsModule],
  controllers: [AsistenteController],
  providers: [AsistenteService, AsistenteRepository],
})
export class AsistenteModule {}
