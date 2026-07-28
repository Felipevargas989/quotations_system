import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { QuotationsService } from 'src/quotations/quotations.service';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { CalendarRepository } from '../calendar.repository';
import { CalendarService } from '../calendar.service';

// Esqueleto reparado (Fase 2 Bloque B): arma el módulo con las
// dependencias REALES de la clase, todas mockeadas. Verifica que la
// clase se pueda construir; las pruebas de comportamiento se agregan
// cuando se toque este módulo.
describe('CalendarService', () => {
  let service: CalendarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        provideMock(CalendarRepository),
        provideMock(QuotationsService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
