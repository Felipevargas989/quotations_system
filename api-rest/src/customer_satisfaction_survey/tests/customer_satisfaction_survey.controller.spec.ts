import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { CustomerSatisfactionSurveyController } from '../controller';
import { CustomerSatisfactionSurveyService } from '../service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('CustomerSatisfactionSurveyController', () => {
  let controller: CustomerSatisfactionSurveyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerSatisfactionSurveyController],
      providers: [
        provideMock(CustomerSatisfactionSurveyService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<CustomerSatisfactionSurveyController>(
      CustomerSatisfactionSurveyController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
