import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        // Lo que ve recepción (doc 21).
        {
          provide: AlcanceDeRecepcion,
          useValue: {
            veLaCotizacion: jest.fn().mockResolvedValue(true),
            veLosMontos: jest.fn().mockResolvedValue(true),
          },
        },
        provideMock(PaymentsService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
