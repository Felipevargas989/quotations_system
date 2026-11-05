import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { ClientsController } from '../clients.controller';
import { ClientsService } from '../clients.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('ClientsController', () => {
  let controller: ClientsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        // Lo que ve recepción (doc 21).
        {
          provide: AlcanceDeRecepcion,
          useValue: {
            veLaCotizacion: jest.fn().mockResolvedValue(true),
            veLosMontos: jest.fn().mockResolvedValue(true),
          },
        },
        provideMock(ClientsService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
