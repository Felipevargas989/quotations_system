import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
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
