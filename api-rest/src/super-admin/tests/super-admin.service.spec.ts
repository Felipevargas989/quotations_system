import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { CustomerSatisfactionSurveyService } from 'src/customer_satisfaction_survey/service';
import { EmailService } from 'src/email/email.service';
import { UsersService } from 'src/users/users.service';
import { SuperAdminRepository } from '../super-admin.repository';
import { SuperAdminService } from '../super-admin.service';
import { mockPinoLogger } from '../../testing/mocks';

// Esqueleto reparado (Fase 2 Bloque B). Construcción directa por las
// dependencias circulares (forwardRef a UsersService y a la encuesta).
describe('SuperAdminService', () => {
  it('should be defined', () => {
    const service = new SuperAdminService(
      mockPinoLogger() as unknown as PinoLogger,
      { get: jest.fn() } as unknown as ConfigService,
      {} as UsersService,
      {} as CompaniesRepository,
      {} as SuperAdminRepository,
      {} as CustomerSatisfactionSurveyService,
      {} as EmailService,
    );
    expect(service).toBeDefined();
  });
});
