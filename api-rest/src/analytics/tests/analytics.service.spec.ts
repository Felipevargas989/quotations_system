import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from 'src/clients/clients.service';
import { PaymentsService } from 'src/payments/payments.service';
import { PinoLogger } from 'nestjs-pino';
import { QuotationsService } from 'src/quotations/quotations.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { AnalyticsService } from '../analytics.service';

// Esqueleto reparado (Fase 2 Bloque B): arma el módulo con las
// dependencias REALES de la clase, todas mockeadas. Verifica que la
// clase se pueda construir; las pruebas de comportamiento se agregan
// cuando se toque este módulo.
describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        provideMock(QuotationsService),
        provideMock(ClientsService),
        provideMock(PaymentsService),
        provideMock(SupabaseService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
