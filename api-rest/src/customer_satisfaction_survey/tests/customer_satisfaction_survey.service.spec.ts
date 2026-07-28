import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { QuotationsService } from 'src/quotations/quotations.service';
import { UsersService } from 'src/users/users.service';
import { CustomerSatisfactionSurveyRepository } from '../repository';
import { CustomerSatisfactionSurveyService } from '../service';
import { mockPinoLogger } from '../../testing/mocks';

// Esqueleto reparado (Fase 2 Bloque B). Construcción directa: las
// importaciones circulares de este módulo dejan el token de
// QuotationsService irreconocible para el módulo de prueba de Nest
// (aparece como "Object"), así que acá no se usa inyección.
describe('CustomerSatisfactionSurveyService', () => {
  it('should be defined', () => {
    const service = new CustomerSatisfactionSurveyService(
      {} as CustomerSatisfactionSurveyRepository,
      {} as QuotationsService,
      {} as UsersService,
      {} as EmailService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    expect(service).toBeDefined();
  });
});
