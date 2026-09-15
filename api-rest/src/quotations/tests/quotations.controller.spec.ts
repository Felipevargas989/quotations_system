import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { DerechosService } from 'src/auth/derechos.service';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { EnvioCotizacionService } from '../envio-cotizacion.service';
import { QuotationsController } from '../quotations.controller';
import { QuotationsService } from '../quotations.service';

// Esqueleto reparado (Fase 2 Bloque B): el controller se construye con
// sus servicios mockeados — nunca instanciar servicios reales acá.
describe('QuotationsController', () => {
  let controller: QuotationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotationsController],
      providers: [
        provideMock(QuotationsService),
        provideMock(EnvioCotizacionService),
        // El controller pregunta los derechos de la empresa en las
        // puertas públicas, que no tienen sesión (paso 3.2, 14-09-2026).
        provideMock(DerechosService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    controller = module.get<QuotationsController>(QuotationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
