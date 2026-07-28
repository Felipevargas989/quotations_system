import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { RefundsController } from '../refunds.controller';
import { RefundsService } from '../refunds.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('RefundsController', () => {
  let controller: RefundsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefundsController],
      providers: [
        provideMock(RefundsService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<RefundsController>(RefundsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
