import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { AnalyticsController } from '../analytics.controller';
import { AnalyticsService } from '../analytics.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        provideMock(AnalyticsService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
