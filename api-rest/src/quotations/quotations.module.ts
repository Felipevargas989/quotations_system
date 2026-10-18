import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { ClientsModule } from 'src/clients/clients.module';
import { CompaniesModule } from 'src/companies/companies.module';
import { ConsultasModule } from 'src/consultas/consultas.module';
import { EmailModule } from 'src/email/email.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { QuotationFollowupsModule } from 'src/quotation-followups/quotation-followups.module';
import { RefundsModule } from 'src/refunds/refunds.module';
import { StorageModule } from 'src/storage/storage.module';
import { UsersModule } from 'src/users/users.module';
import { ChoquesRepository } from './choques/choques.repository';
import { ChoquesDeFechaService } from './choques/choques.service';
import { EnvioCotizacionService } from './envio-cotizacion.service';
import {
  EventDocumentsController,
  EventDocumentsRepository,
} from './event-documents.controller';
import { GenerarRepository } from './generar/generar.repository';
import { GenerarCotizacionService } from './generar/generar.service';
import {
  PortalReceiptsController,
  PortalReceiptsRepository,
} from './portal-receipts.controller';
import { PortalController } from './portal.controller';
import { QuotationsCronService } from './quotations-cron.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsRepository } from './quotations.repository';
import { QuotationsService } from './quotations.service';
import { RescateDelFormularioService } from './rescate-del-formulario.service';
import { SeguimientoRepository } from './seguimiento/seguimiento.repository';
import { SeguimientoConIAService } from './seguimiento/seguimiento.service';

@Module({
  imports: [
    // La sesión opcional de GET /quotations/:id (comentario interno, 17-10).
    AuthModule,
    RefundsModule,
    ClientsModule,
    CompaniesModule,
    ConsultasModule,
    EmailModule,
    QuotationFollowupsModule,
    StorageModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [
    QuotationsController,
    EventDocumentsController,
    PortalController,
    PortalReceiptsController,
  ],
  providers: [
    RescateDelFormularioService,
    QuotationsService,
    EnvioCotizacionService,
    // El botón «✨ Crear con IA» (doc 16 §6, 17-10-2026).
    GenerarCotizacionService,
    GenerarRepository,
    SeguimientoConIAService,
    SeguimientoRepository,
    ChoquesDeFechaService,
    ChoquesRepository,
    QuotationsRepository,
    QuotationsCronService,
    EventDocumentsRepository,
    PortalReceiptsRepository,
  ],
  exports: [QuotationsService, QuotationsRepository],
})
export class QuotationsModule {}
