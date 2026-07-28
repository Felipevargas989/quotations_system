import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { PaymentsRepository } from '../payments.repository';
import { PaymentsService } from '../payments.service';
import { mockPinoLogger } from '../../testing/mocks';

// Esqueleto reparado (Fase 2 Bloque B). Construcción directa por la
// dependencia circular (forwardRef a QuotationsService).
describe('PaymentsService', () => {
  it('should be defined', () => {
    const service = new PaymentsService(
      {} as PaymentsRepository,
      {} as QuotationsRepository,
      {} as QuotationsService,
      {} as EmailService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    expect(service).toBeDefined();
  });
});
