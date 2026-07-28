import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { EmailService } from '../email.service';

// Esqueleto reparado (Fase 2 Bloque B): arma el módulo con las
// dependencias REALES de la clase, todas mockeadas. Verifica que la
// clase se pueda construir; las pruebas de comportamiento se agregan
// cuando se toque este módulo.
describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        provideMock(ConfigService),
        provideMock(CompaniesRepository),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
